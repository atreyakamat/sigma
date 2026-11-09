import { expect, test } from '@playwright/test';
import type { Browser, Page } from '@playwright/test';
import { totp } from '../../apps/api/src/common/totp';
import { ADMIN_EMAIL } from './global-setup';

const run = Date.now().toString(36);
const MIA_TEMP = 'Mia-Temp-2026!';
const MIA_PASSWORD = 'Mia-Password-2026!';
// 1×1 transparent PNG.
const DOT_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
  'base64',
);

async function login(page: Page, email: string, password: string, finalPassword?: string) {
  await page.goto('/login');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await Promise.race([
    page.waitForURL((u) => !u.pathname.startsWith('/login')),
    page.getByRole('alert').waitFor(),
    page.getByTestId('two-factor-form').waitFor(),
  ]);
  if (page.url().includes('/change-password') && finalPassword) {
    await page.getByLabel(/temporary password|current password/i).fill(password);
    await page.getByLabel('New password', { exact: true }).fill(finalPassword);
    await page.getByLabel('Confirm new password').fill(finalPassword);
    await page.getByRole('button', { name: 'Save password' }).click();
    await page.waitForURL((u) => !u.pathname.includes('change-password'));
  }
}

async function canvasBox(page: Page) {
  const box = await page.getByTestId('canvas-host').boundingBox();
  if (!box) throw new Error('canvas not found');
  return box;
}
async function drag(page: Page, from: [number, number], to: [number, number]) {
  await page.mouse.move(from[0], from[1]);
  await page.mouse.down();
  await page.mouse.move(to[0], to[1], { steps: 6 });
  await page.mouse.up();
}

test.describe.serial('platform: realtime, prototyping, assets, security', () => {
  let fileUrl = '';
  let documentId = '';
  let origin = '';
  let adminCookies: Awaited<ReturnType<Page['context']>['cookies']> = [];
  const asAdmin = async (page: Page) => {
    if (adminCookies.length) await page.context().addCookies(adminCookies);
    else {
      await login(page, ADMIN_EMAIL, process.env.E2E_ADMIN_PASSWORD as string);
      adminCookies = await page.context().cookies();
    }
  };
  const asUser = async (browser: Browser, email: string, password: string, temp?: string) => {
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    await login(page, email, temp ?? password, temp ? password : undefined);
    return { ctx, page };
  };

  test('setup: workspace, editor account and a design file', async ({ page }) => {
    await asAdmin(page);
    await page.goto('/');
    origin = new URL(page.url()).origin;
    const headers = { Origin: origin };
    const ws = await (
      await page.request.post(`${origin}/api/v1/workspaces`, {
        data: { name: `Platform ${run}` },
        headers,
      })
    ).json();
    const project = await (
      await page.request.post(`${origin}/api/v1/workspaces/${ws.id}/projects`, {
        data: { name: 'Realtime' },
        headers,
      })
    ).json();
    const doc = await (
      await page.request.post(`${origin}/api/v1/projects/${project.id}/documents`, {
        data: { name: 'Shared file' },
        headers,
      })
    ).json();
    documentId = doc.id;
    fileUrl = `${origin}/file/${documentId}`;
    const created = await page.request.post(`${origin}/api/v1/users`, {
      data: { name: 'Mia', email: `mia-${run}@sigma.local`, password: MIA_TEMP },
      headers,
    });
    expect(created.ok()).toBeTruthy();
    const member = await page.request.post(`${origin}/api/v1/workspaces/${ws.id}/members`, {
      data: { email: `mia-${run}@sigma.local`, role: 'EDITOR' },
      headers,
    });
    expect(member.ok()).toBeTruthy();
  });

  test('realtime co-editing: a shape drawn by one editor appears for the other without reloading', async ({
    page,
    browser,
  }) => {
    await asAdmin(page);
    await page.goto(fileUrl);
    const mia = await asUser(browser, `mia-${run}@sigma.local`, MIA_PASSWORD, MIA_TEMP);
    await mia.page.goto(fileUrl);
    await expect(page.getByTestId('presence-avatars')).toContainText('M', { timeout: 10_000 });
    await mia.page.evaluate(() => ((window as unknown as { __marker: number }).__marker = 42));

    const box = await canvasBox(page);
    await page.keyboard.press('r');
    await drag(page, [box.x + 300, box.y + 200], [box.x + 420, box.y + 300]);
    await expect(mia.page.locator('aside').first().getByText('Rectangle')).toBeVisible({
      timeout: 10_000,
    });
    expect(
      await mia.page.evaluate(() => (window as unknown as { __marker: number }).__marker),
    ).toBe(42);
    await expect(page.getByTestId('save-status')).toHaveText('Saved', { timeout: 10_000 });

    // Mia edits the same shape; the admin sees the rename live.
    mia.page.once('dialog', (d) => d.accept('Hero card'));
    await mia.page.locator('aside').first().getByText('Rectangle').dblclick();
    await expect(page.locator('aside').first().getByText('Hero card')).toBeVisible({
      timeout: 10_000,
    });
    await expect(mia.page.getByTestId('save-status')).toHaveText('Saved', { timeout: 10_000 });
    const stored = await (
      await page.request.get(`${origin}/api/v1/documents/${documentId}`)
    ).json();
    expect(stored.revision).toBeGreaterThanOrEqual(1);
    expect(JSON.stringify(stored.content)).toContain('Hero card');
    await mia.ctx.close();
  });

  test('gradient editor: switch a fill to linear and add a stop', async ({ page }) => {
    await asAdmin(page);
    await page.goto(fileUrl);
    await page.locator('aside').first().getByText('Hero card').click();
    const inspector = page.locator('aside').last();
    await inspector.getByLabel('Fill type').selectOption('LINEAR_GRADIENT');
    await inspector.getByTestId('gradient-toggle').click();
    await expect(inspector.getByTestId('gradient-editor')).toBeVisible();
    await inspector.getByRole('button', { name: 'Add stop' }).click();
    await expect(inspector.getByTestId('gradient-toggle')).toContainText('3 stops');
    await expect(page.getByTestId('save-status')).toHaveText('Saved', { timeout: 10_000 });
  });

  test('prototyping: link a layer to another frame and play it in the preview', async ({
    page,
  }) => {
    await asAdmin(page);
    await page.goto(fileUrl);
    const box = await canvasBox(page);
    await page.keyboard.press('f');
    await drag(page, [box.x + 60, box.y + 380], [box.x + 300, box.y + 620]);
    await page.keyboard.press('f');
    await drag(page, [box.x + 360, box.y + 380], [box.x + 600, box.y + 620]);
    await page.keyboard.press('r');
    await drag(page, [box.x + 90, box.y + 420], [box.x + 200, box.y + 470]);

    const inspector = page.locator('aside').last();
    await inspector.getByTestId('add-interaction').click();
    const interaction = inspector.getByTestId('interaction');
    await expect(interaction).toHaveCount(1);
    // trigger · action · target selects: point the navigation at the second frame.
    await interaction.locator('select').nth(2).selectOption({ index: 1 });
    await expect(page.getByTestId('save-status')).toHaveText('Saved', { timeout: 10_000 });

    await page.getByTestId('preview-button').click();
    await expect(page).toHaveURL(/\/preview$/);
    await expect(page.getByTestId('preview-frame')).toBeVisible();
    const before = await page.getByTestId('preview-screen-name').innerText();
    await expect(page.getByTestId('hotspot')).toHaveCount(1);
    await page.getByTestId('hotspot').click();
    await expect(page.getByTestId('preview-screen-name')).not.toHaveText(before);
    await page.keyboard.press('Escape');
    await expect(page).toHaveURL(fileUrl);
  });

  test('assets: placing an image uploads it and the file references the asset URL', async ({
    page,
  }) => {
    await asAdmin(page);
    await page.goto(fileUrl);
    await page.getByTestId('canvas-host').waitFor();
    await page
      .locator('input[type=file]')
      .first()
      .setInputFiles({ name: 'dot.png', mimeType: 'image/png', buffer: DOT_PNG });
    await expect(page.locator('aside').first().getByText('dot')).toBeVisible({ timeout: 10_000 });
    await expect(page.getByTestId('save-status')).toHaveText('Saved', { timeout: 10_000 });
    const stored = await (
      await page.request.get(`${origin}/api/v1/documents/${documentId}`)
    ).json();
    const refs: { assetId?: string | null; src?: string | null }[] = [];
    const walk = (v: unknown) => {
      if (Array.isArray(v)) v.forEach(walk);
      else if (v && typeof v === 'object') {
        if ('assetId' in v && typeof (v as { assetId: unknown }).assetId === 'string')
          refs.push(v as { assetId: string; src: string });
        Object.values(v).forEach(walk);
      }
    };
    walk(stored.content);
    expect(refs.length).toBeGreaterThan(0);
    expect(refs[0]!.src).toMatch(/^\/api\/v1\/assets\/.+\/content/);
    const img = await page.request.get(`${origin}${refs[0]!.src}`);
    expect(img.ok()).toBeTruthy();
    expect(img.headers()['content-type']).toBe('image/png');
    const signed = await (
      await page.request.post(`${origin}/api/v1/assets/${refs[0]!.assetId}/signed-url`, {
        data: { expiresInSeconds: 60 },
        headers: { Origin: origin },
      })
    ).json();
    const anon = await page.request.get(`${origin}${signed.url}`, { headers: { Cookie: '' } });
    expect(anon.ok()).toBeTruthy();
  });

  test('share links: a read-only link opens without an account and PDF export renders frames', async ({
    page,
    browser,
  }) => {
    await asAdmin(page);
    await page.goto(fileUrl);
    await page.getByTestId('share-button').click();
    await page.getByTestId('create-share-link').click();
    const url = await page.getByTestId('share-link-url').inputValue();
    expect(url).toMatch(/\/share\/[A-Za-z0-9_-]{20,}$/);
    await expect(page.getByTestId('share-link-row')).toHaveCount(1);
    await page.keyboard.press('Escape');

    const anon = await browser.newContext();
    const viewer = await anon.newPage();
    await viewer.goto(url);
    await expect(viewer.getByTestId('shared-view')).toBeVisible();
    await expect(viewer.locator('aside').first().getByText('Hero card')).toBeVisible();
    await expect(viewer.getByTestId('share-button')).toHaveCount(0);
    await expect(viewer.getByTestId('presence-avatars')).toHaveCount(0);
    const token = url.split('/share/')[1] as string;
    const png = await viewer.request.get(`${origin}/api/v1/share/${token}/export.png?scale=1`);
    expect(png.ok()).toBeTruthy();
    await anon.close();

    const pdf = await page.request.get(
      `${origin}/api/v1/documents/${documentId}/export.pdf?scale=1`,
    );
    expect(pdf.ok()).toBeTruthy();
    expect(pdf.headers()['content-type']).toBe('application/pdf');
    const body = (await pdf.body()).toString('latin1');
    expect(body.startsWith('%PDF-1.4')).toBe(true);
    expect(body).toMatch(/\/Count [1-9]/);

    // Revoke from the dialog: the link stops working.
    await page.getByTestId('share-button').click();
    await page.getByTitle('Revoke').first().click();
    await expect(page.getByTestId('share-link-row')).toHaveCount(0);
    const gone = await page.request.get(`${origin}/api/v1/share/${token}`);
    expect(gone.status()).toBe(404);
    await page.keyboard.press('Escape');
  });

  test('AI assistant: admin adds the demo provider, the assistant edits the file, ops API works with a token', async ({
    page,
  }) => {
    await asAdmin(page);
    await page.goto('/admin/ai');
    if ((await page.getByTestId('ai-provider-row').count()) === 0) {
      await page.getByTestId('add-ai-provider').click();
      await page.getByLabel('Provider type').selectOption('demo');
      await page.getByTestId('save-ai-provider').click();
    }
    await expect(page.getByTestId('ai-provider-row').first()).toBeVisible();
    await page.getByRole('button', { name: 'Test' }).first().click();
    await expect(page.getByTestId('ai-test-result').first()).toContainText('works');

    await page.goto(fileUrl);
    await page.getByTestId('left-tab-assistant').click();
    await expect(page.getByTestId('assistant-panel')).toBeVisible();
    await page
      .getByTestId('assistant-input')
      .fill('add a pink rectangle named Promo banner 300x90');
    await page.keyboard.press('Enter');
    await expect(page.getByTestId('assistant-assistant').last()).toContainText(
      'Added Promo banner',
      { timeout: 15_000 },
    );
    await page.getByTestId('left-tab-layers').click();
    await expect(page.locator('aside').first().getByText('Promo banner')).toBeVisible({
      timeout: 10_000,
    });

    // The same editing surface over HTTP, as the MCP server uses it.
    const res = await page.request.post(`${origin}/api/v1/documents/${documentId}/ops`, {
      data: {
        ops: [
          {
            op: 'add',
            type: 'TEXT',
            name: 'Scripted label',
            text: 'Made by a script',
            x: 40,
            y: 700,
          },
        ],
      },
      headers: { Origin: origin },
    });
    expect(res.ok()).toBeTruthy();
    expect((await res.json()).applied).toBe(1);
    await expect(page.locator('aside').first().getByText('Scripted label')).toBeVisible({
      timeout: 10_000,
    });
    const outline = await (
      await page.request.get(`${origin}/api/v1/documents/${documentId}/outline`)
    ).json();
    expect(JSON.stringify(outline)).toContain('Promo banner');
  });

  test('security: two-factor enrolment, 2FA sign-in, session list and disabling', async ({
    browser,
  }) => {
    const mia = await asUser(browser, `mia-${run}@sigma.local`, MIA_PASSWORD);
    const { page } = mia;
    await page.goto('/settings/security');
    await expect(page.getByTestId('session-current')).toHaveCount(1);
    await page.getByTestId('enable-2fa').click();
    const secret = (await page.getByTestId('totp-secret').innerText()).trim();
    await page.getByTestId('totp-code').fill(totp(secret));
    await page.getByRole('button', { name: 'Turn on' }).click();
    await expect(page.getByTestId('recovery-codes')).toBeVisible();
    const codes = (await page.getByTestId('recovery-codes').innerText())
      .split(/\s+/)
      .filter(Boolean);
    expect(codes.length).toBeGreaterThanOrEqual(8);
    await page.getByRole('button', { name: 'Done' }).click();
    await expect(page.getByRole('button', { name: 'Disable' })).toBeVisible();

    // A second sign-in now requires the code.
    const second = await browser.newContext();
    const p2 = await second.newPage();
    await login(p2, `mia-${run}@sigma.local`, MIA_PASSWORD);
    await expect(p2.getByTestId('two-factor-form')).toBeVisible();
    await p2.getByLabel('Code').fill('000000');
    await p2.getByRole('button', { name: 'Verify' }).click();
    await expect(p2.getByRole('alert')).toBeVisible();
    await p2.getByLabel('Code').fill(totp(secret));
    await p2.getByRole('button', { name: 'Verify' }).click();
    await p2.waitForURL((u) => !u.pathname.startsWith('/login'));

    await page.reload();
    // The realtime test left an earlier session behind, so at least the new sign-in shows up.
    await expect(page.getByTestId('session-other').first()).toBeVisible();
    await page.getByRole('button', { name: 'Sign out other sessions' }).click();
    await expect(page.getByTestId('session-other')).toHaveCount(0);
    await p2.goto('/settings/security');
    await expect(p2).toHaveURL(/\/login/);
    await second.close();

    await page.getByRole('button', { name: 'Disable' }).click();
    await page.getByLabel(/Current code/).fill(codes[0] as string);
    await page.getByRole('button', { name: 'Disable' }).last().click();
    await expect(page.getByTestId('enable-2fa')).toBeVisible();
    await mia.ctx.close();
  });

  test('admin audit log lists sign-ins; language switch applies immediately', async ({ page }) => {
    await asAdmin(page);
    await page.goto('/admin/audit');
    await expect(page.getByTestId('audit-table')).toContainText('auth.login');
    await expect(page.getByTestId('audit-table')).toContainText('user.create');
    await page.goto('/');
    await page.getByRole('button', { name: /Root Admin|Administrator/ }).click();
    await page.locator('header select').selectOption('hi');
    await expect(page.getByText('साइन आउट')).toBeVisible();
    await expect(page.getByRole('heading', { name: 'वर्कस्पेस' })).toBeVisible();
    await page.locator('header select').selectOption('en');
  });

  test('tablet layout: side panels start closed and float over the canvas', async ({ browser }) => {
    const ctx = await browser.newContext({ viewport: { width: 420, height: 820 }, hasTouch: true });
    await ctx.addCookies(adminCookies);
    const page = await ctx.newPage();
    await page.goto(fileUrl);
    await expect(page.getByTestId('canvas-host')).toBeVisible();
    await expect(page.locator('aside').first()).toBeHidden();
    await page.getByTitle('Toggle left panel').click();
    await expect(page.locator('aside').first()).toBeVisible();
    await expect(page.locator('aside').first()).toHaveClass(/absolute/);
    await ctx.close();
  });
});
