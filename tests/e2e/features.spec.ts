import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { ADMIN_EMAIL, ADMIN_FINAL_PASSWORD } from './global-setup';

const run = Date.now().toString(36);
const LEE_TEMP = 'Lee-Temp-2026!';
const LEE_PASSWORD = 'Lee-Password-2026!';

async function login(
  page: Page,
  email: string,
  password: string,
  finalPassword = ADMIN_FINAL_PASSWORD,
) {
  await page.goto('/login');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await Promise.race([
    page.waitForURL((u) => !u.pathname.startsWith('/login')),
    page.getByRole('alert').waitFor(),
  ]);
  if (page.url().includes('/change-password')) {
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

test.describe.serial('standout features', () => {
  let fileUrl = '';
  let documentId = '';
  let adminCookies: Awaited<ReturnType<Page['context']>['cookies']> = [];
  const asAdmin = async (page: Page) => {
    if (adminCookies.length) await page.context().addCookies(adminCookies);
    else {
      await login(page, ADMIN_EMAIL, process.env.E2E_ADMIN_PASSWORD as string);
      adminCookies = await page.context().cookies();
    }
  };

  test('onboarding checklist, command palette, frame presets and shortcuts help', async ({
    page,
  }) => {
    await asAdmin(page);
    await page.goto('/');
    await page.getByRole('button', { name: 'New workspace' }).click();
    await page.getByLabel('Name').fill(`Features ${run}`);
    await page.getByRole('button', { name: 'Create' }).click();
    await page.getByRole('link', { name: `Features ${run}` }).click();
    await page.getByRole('button', { name: 'New project' }).click();
    await page.getByLabel('Name').fill('App');
    await page.getByRole('button', { name: 'Create' }).click();
    await page.getByRole('link', { name: 'App' }).click();
    await page.getByRole('button', { name: 'New design file' }).click();
    await expect(page).toHaveURL(/\/file\//);
    fileUrl = page.url();
    documentId = fileUrl.split('/file/')[1] as string;

    const checklist = page.getByTestId('onboarding-checklist');
    await expect(checklist).toContainText('0/6');

    await page.keyboard.press('Control+k');
    await page.getByPlaceholder(/Type a command/).fill('iphone');
    await page.keyboard.press('Enter');
    await expect(page.locator('aside').first().getByText('iPhone 15')).toBeVisible();
    await expect(checklist).toContainText('1/6');

    await page.keyboard.press('Escape');
    await page.keyboard.press('?');
    await expect(page.getByRole('dialog', { name: 'Keyboard shortcuts' })).toContainText('Undo');
    await page.keyboard.press('Escape');

    const box = await canvasBox(page);
    await page.keyboard.press('r');
    await drag(page, [box.x + 500, box.y + 100], [box.x + 600, box.y + 180]);
    await expect(checklist).toContainText('2/6');
    await page.keyboard.press('t');
    await page.mouse.click(box.x + 500, box.y + 300);
    await page.keyboard.type('Hello');
    await page.keyboard.press('Escape');
    await expect(checklist).toContainText('3/6');
    await expect(page.getByTestId('hint')).toContainText('Editing text');
    await expect(page.getByTestId('save-status')).toHaveText('Saved', { timeout: 10_000 });
  });

  test('history panel, named versions, visual diff and restore', async ({ page }) => {
    await asAdmin(page);
    await page.goto(fileUrl);
    await page
      .locator('aside')
      .first()
      .getByRole('button', { name: 'history', exact: true })
      .click();
    await expect(page.locator('aside').first()).toContainText('Edits will appear here');
    const box = await canvasBox(page);
    await page.keyboard.press('o');
    await drag(page, [box.x + 700, box.y + 100], [box.x + 780, box.y + 180]);
    await expect(page.locator('aside').first()).toContainText('Create Ellipse');
    await expect(page.getByTestId('save-status')).toHaveText('Saved', { timeout: 10_000 });

    await page.getByTitle('Version history').click();
    await page.getByPlaceholder('Name this version…').fill('With ellipse');
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(page.getByTestId('versions-list')).toContainText('With ellipse');
    await page.keyboard.press('Escape');

    await page.mouse.click(box.x + 740, box.y + 140);
    await page.keyboard.press('Delete');
    await expect(page.getByTestId('save-status')).toHaveText('Saved', { timeout: 10_000 });
    await page.getByTitle('Version history').click();
    await page.getByText('With ellipse').click();
    await expect(page.getByTestId('version-diff')).toContainText('1 removed');
    page.once('dialog', (d) => d.accept());
    await page.getByRole('button', { name: 'Restore this version' }).click();
    await expect(page.locator('aside').first().getByText('Ellipse')).toBeVisible({
      timeout: 10_000,
    });
  });

  test('comments: place a pin, reply, resolve; shows in the panel', async ({ page }) => {
    await asAdmin(page);
    await page.goto(fileUrl);
    const box = await canvasBox(page);
    await page.getByTitle('Add comment (C)').waitFor();
    await page.keyboard.press('c');
    await expect(page.getByTitle('Add comment (C)')).toHaveAttribute('data-active', 'true');
    await page.mouse.click(box.x + 300, box.y + 500);
    await page.getByTestId('comment-composer').fill('Make this bolder');
    await page.getByRole('button', { name: 'Comment', exact: true }).click();
    await expect(page.getByTestId('comment-pin')).toHaveCount(1);
    await page.getByTestId('comment-pin').click();
    await page.getByPlaceholder('Reply…').fill('Done');
    await page.getByRole('button', { name: 'Send' }).click();
    await expect(page.getByText('2 messages')).toBeVisible();
    await page.getByTitle('Resolve').click();
    await expect(page.getByTestId('comment-pin')).toHaveCount(0);
    await page
      .locator('aside')
      .first()
      .getByRole('button', { name: 'comments', exact: true })
      .click();
    await page.getByLabel('resolved').check();
    await expect(page.getByTestId('comment-pin')).toHaveCount(1);
  });

  test('frame review state and lock are visible and enforced for another editor', async ({
    page,
    browser,
  }) => {
    await asAdmin(page);
    await page.goto(fileUrl);
    await page.locator('aside').first().getByText('iPhone 15').click();
    const inspector = page.locator('aside').last();
    await inspector
      .getByRole('combobox')
      .filter({ has: page.locator('option[value="APPROVED"]') })
      .selectOption('APPROVED');
    page.once('dialog', (d) => d.accept('8'));
    await inspector.getByTestId('frame-lock-toggle').click();
    await expect(inspector.getByTestId('frame-lock-toggle')).toContainText('Unlock');
    await expect(page.getByTestId('save-status')).toHaveText('Saved', { timeout: 10_000 });

    const origin = new URL(page.url()).origin;
    const created = await page.request.post(`${origin}/api/v1/users`, {
      data: { name: 'Lee', email: `lee-${run}@sigma.local`, password: LEE_TEMP },
      headers: { Origin: origin },
    });
    expect(created.ok()).toBeTruthy();
    const ws = (await (await page.request.get(`${origin}/api/v1/workspaces`)).json()) as {
      id: string;
      name: string;
    }[];
    const wsId = ws.find((w) => w.name === `Features ${run}`)!.id;
    await page.request.post(`${origin}/api/v1/workspaces/${wsId}/members`, {
      data: { email: `lee-${run}@sigma.local`, role: 'EDITOR' },
      headers: { Origin: origin },
    });

    const ctx = await browser.newContext();
    const lee = await ctx.newPage();
    await login(lee, `lee-${run}@sigma.local`, LEE_TEMP, LEE_PASSWORD);
    await lee.goto(fileUrl);
    await lee.locator('aside').first().getByText('iPhone 15').click();
    await expect(lee.locator('aside').last().getByTestId('frame-locked-by')).toContainText(
      'Locked by',
    );
    const leeBox = await canvasBox(lee);
    await lee.mouse.click(leeBox.x + 150, leeBox.y + 150);
    await lee.keyboard.press('Delete');
    await expect(lee.locator('aside').first().getByText('iPhone 15')).toBeVisible();
    const doc = await (await lee.request.get(`${origin}/api/v1/documents/${documentId}`)).json();
    const tampered = JSON.parse(JSON.stringify(doc.content));
    tampered.pages[0].children = tampered.pages[0].children.map((c: { name: string }) =>
      c.name === 'iPhone 15' ? { ...c, name: 'Hacked' } : c,
    );
    const rejected = await lee.request.put(`${origin}/api/v1/documents/${documentId}/content`, {
      data: { content: tampered, baseRevision: doc.revision },
      headers: { Origin: origin },
    });
    expect(rejected.status()).toBe(409);
    await ctx.close();
  });

  test('live presence: another user appears with a cursor; saves refresh the other editor', async ({
    page,
    browser,
  }) => {
    await asAdmin(page);
    await page.goto(fileUrl);
    const ctx = await browser.newContext();
    const lee = await ctx.newPage();
    await login(lee, `lee-${run}@sigma.local`, LEE_PASSWORD);
    await lee.goto(fileUrl);
    await expect(page.getByTestId('presence-avatars')).toContainText('L', { timeout: 10_000 });
    const leeBox = await canvasBox(lee);
    await lee.mouse.move(leeBox.x + 400, leeBox.y + 400);
    await lee.mouse.move(leeBox.x + 420, leeBox.y + 410);
    await expect(page.locator('[data-testid^="cursor-"]')).toHaveCount(1, { timeout: 10_000 });
    await lee.keyboard.press('r');
    await drag(lee, [leeBox.x + 600, leeBox.y + 420], [leeBox.x + 660, leeBox.y + 480]);
    await expect(lee.getByTestId('save-status')).toHaveText('Saved', { timeout: 10_000 });
    await expect(page.locator('aside').first().getByText('Rectangle').last()).toBeVisible({
      timeout: 10_000,
    });
    await ctx.close();
  });

  test('API tokens: create one and use it for server-side rendering and tokens', async ({
    page,
  }) => {
    await asAdmin(page);
    await page.goto('/settings/tokens');
    await page.getByRole('button', { name: 'New token' }).click();
    await page.getByLabel(/Name/).fill('CI');
    await page.getByRole('button', { name: 'Create' }).click();
    const secret = (await page.getByTestId('api-token-secret').innerText()).trim();
    expect(secret.startsWith('sgm_')).toBeTruthy();
    const origin = new URL(page.url()).origin;
    const png = await page.request.get(
      `${origin}/api/v1/documents/${documentId}/export.png?scale=1`,
      { headers: { Authorization: `Bearer ${secret}` } },
    );
    expect(png.ok()).toBeTruthy();
    expect(png.headers()['content-type']).toBe('image/png');
    expect((await png.body()).length).toBeGreaterThan(500);
    const css = await page.request.get(`${origin}/api/v1/documents/${documentId}/tokens.css`, {
      headers: { Authorization: `Bearer ${secret}` },
    });
    expect(await css.text()).toContain(':root {');
    const frames = await (
      await page.request.get(`${origin}/api/v1/documents/${documentId}/frames?approved=true`, {
        headers: { Authorization: `Bearer ${secret}` },
      })
    ).json();
    expect(frames.map((f: { name: string }) => f.name)).toEqual(['iPhone 15']);
  });
});
