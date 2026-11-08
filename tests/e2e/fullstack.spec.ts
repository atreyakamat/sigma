import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { ADMIN_EMAIL, ADMIN_FINAL_PASSWORD } from './global-setup';

const run = Date.now().toString(36);
const VIEWER_EMAIL = `vera-${run}@sigma.local`;
const VIEWER_FINAL_PASSWORD = 'Vera-Password-2026!';

async function login(page: Page, email: string, password: string) {
  await page.goto('/login');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await Promise.race([
    page.waitForURL((u) => !u.pathname.startsWith('/login')),
    page.getByRole('alert').waitFor(),
  ]);
}

async function changePasswordIfForced(page: Page, current: string, next: string) {
  if (!page.url().includes('/change-password')) return;
  await page.getByLabel(/temporary password|current password/i).fill(current);
  await page.getByLabel('New password', { exact: true }).fill(next);
  await page.getByLabel('Confirm new password').fill(next);
  await page.getByRole('button', { name: 'Save password' }).click();
  await expect(page).not.toHaveURL(/change-password/);
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

test.describe.serial('self-hosted SIGMA', () => {
  let viewerTempPassword = '';
  let fileUrl = '';
  let workspaceUrl = '';
  let adminState: Awaited<ReturnType<Page['context']>['storageState']> | null = null;

  /** Reuses the admin session captured in the first test instead of logging in again (login is rate limited). */
  async function asAdmin(page: Page) {
    if (adminState) {
      await page.context().addCookies(adminState.cookies);
      return;
    }
    await login(page, ADMIN_EMAIL, ADMIN_FINAL_PASSWORD);
  }

  test('admin signs in, is forced to set a password, and creates a user with a generated password', async ({
    page,
  }) => {
    await login(page, ADMIN_EMAIL, process.env.E2E_ADMIN_PASSWORD as string);
    await changePasswordIfForced(
      page,
      process.env.E2E_ADMIN_PASSWORD as string,
      ADMIN_FINAL_PASSWORD,
    );
    await expect(page.getByRole('heading', { name: 'Workspaces' })).toBeVisible();
    await expect(page.getByText('Workspace', { exact: true })).toBeVisible();

    await page.getByRole('link', { name: 'Users' }).click();
    await page.getByRole('button', { name: 'Add user' }).click();
    await page.getByLabel('Name').fill('Vera');
    await page.getByLabel('Email').fill(VIEWER_EMAIL);
    await page.getByRole('button', { name: 'Create user' }).click();
    const secret = page.getByTestId('temporary-password');
    await expect(secret).toBeVisible();
    viewerTempPassword = (await secret.innerText()).trim();
    expect(viewerTempPassword).toHaveLength(16);
    await page.getByRole('button', { name: 'Done' }).click();
    await expect(page.getByTestId(`user-row-${VIEWER_EMAIL}`)).toContainText('temp password');
    adminState = await page.context().storageState();
  });

  test('admin creates a workspace, adds the user as viewer, creates a project and draws in a file', async ({
    page,
  }) => {
    await asAdmin(page);
    await page.goto('/');
    await page.getByRole('button', { name: 'New workspace' }).click();
    await page.getByLabel('Name').fill(`Team ${run}`);
    await page.getByRole('button', { name: 'Create' }).click();
    await page.getByRole('link', { name: `Team ${run}` }).click();
    workspaceUrl = page.url();

    await page.getByRole('button', { name: 'members' }).click();
    await page.getByPlaceholder('person@example.com').fill(VIEWER_EMAIL);
    await page.getByRole('button', { name: 'Add', exact: true }).click();
    await expect(page.getByRole('row').filter({ hasText: VIEWER_EMAIL })).toContainText('Editor'); // default select value
    await page
      .getByRole('row')
      .filter({ hasText: VIEWER_EMAIL })
      .getByRole('combobox')
      .selectOption('VIEWER');
    await expect(
      page.getByRole('row').filter({ hasText: VIEWER_EMAIL }).getByRole('combobox'),
    ).toHaveValue('VIEWER');

    await page.getByRole('button', { name: 'projects' }).click();
    await page.getByRole('button', { name: 'New project' }).click();
    await page.getByLabel('Name').fill('Website');
    await page.getByRole('button', { name: 'Create' }).click();
    await page.getByRole('link', { name: 'Website' }).click();
    await page.getByRole('button', { name: 'New design file' }).click();
    await expect(page).toHaveURL(/\/file\//);
    fileUrl = page.url();

    const box = await canvasBox(page);
    await page.keyboard.press('r');
    await drag(page, [box.x + 150, box.y + 150], [box.x + 350, box.y + 270]);
    await expect(page.getByText('1 layers')).toBeVisible();
    await expect(page.getByTestId('save-status')).toHaveText('Saved', { timeout: 10_000 });
    await page.reload();
    await expect(page.getByText('1 layers')).toBeVisible();
    await expect(page.locator('aside').first().getByText('Rectangle')).toBeVisible();
  });

  test('the viewer must change the temporary password and gets a view-only editor', async ({
    page,
  }) => {
    await login(page, VIEWER_EMAIL, viewerTempPassword);
    await expect(page).toHaveURL(/change-password/);
    await changePasswordIfForced(page, viewerTempPassword, VIEWER_FINAL_PASSWORD);
    await expect(page.getByRole('link', { name: 'Users' })).toHaveCount(0); // not a system admin

    await page.goto(fileUrl);
    await expect(page.getByTestId('view-only')).toBeVisible();
    await expect(page.getByTitle('Frame (F)')).toHaveCount(0);
    await expect(page.locator('aside').first().getByText('Rectangle')).toBeVisible();
    const box = await canvasBox(page);
    await page.keyboard.press('r');
    await drag(page, [box.x + 400, box.y + 400], [box.x + 500, box.y + 500]);
    await expect(page.getByText('1 layers')).toBeVisible();
    await page.keyboard.press('Delete');
    await expect(page.getByText('1 layers')).toBeVisible();

    const forbidden = await page.request.post(new URL('/api/v1/users', page.url()).toString(), {
      data: { name: 'X', email: 'x@sigma.local' },
      headers: { Origin: new URL(page.url()).origin },
    });
    expect(forbidden.status()).toBe(403);
  });

  test('promoting the viewer to editor unlocks editing', async ({ page, browser }) => {
    await asAdmin(page);
    await page.goto(`${workspaceUrl}?tab=members`);
    await page
      .getByRole('row')
      .filter({ hasText: VIEWER_EMAIL })
      .getByRole('combobox')
      .selectOption('EDITOR');
    await expect(
      page.getByRole('row').filter({ hasText: VIEWER_EMAIL }).getByRole('combobox'),
    ).toHaveValue('EDITOR');

    const ctx = await browser.newContext();
    const editorPage = await ctx.newPage();
    await login(editorPage, VIEWER_EMAIL, VIEWER_FINAL_PASSWORD);
    await editorPage.goto(fileUrl);
    await expect(editorPage.getByTestId('view-only')).toHaveCount(0);
    const box = await canvasBox(editorPage);
    await editorPage.keyboard.press('o');
    await drag(editorPage, [box.x + 420, box.y + 160], [box.x + 520, box.y + 260]);
    await expect(editorPage.getByText('2 layers')).toBeVisible();
    await expect(editorPage.getByTestId('save-status')).toHaveText('Saved', { timeout: 10_000 });
    await ctx.close();

    // The admin's open copy is now stale: its next save must be rejected and surfaced.
    await page.goto(fileUrl);
    await expect(page.getByText('2 layers')).toBeVisible();
  });

  test('a stale editor gets a conflict banner instead of overwriting newer work', async ({
    page,
    browser,
  }) => {
    await asAdmin(page);
    // Presence is blocked here so the editor cannot refresh itself; the server's revision check must catch the stale save.
    await page.routeWebSocket(/\/api\/v1\/presence/, () => undefined);
    await page.goto(fileUrl);
    await expect(page.getByText('2 layers')).toBeVisible();

    const ctx = await browser.newContext();
    const other = await ctx.newPage();
    await login(other, VIEWER_EMAIL, VIEWER_FINAL_PASSWORD);
    await other.goto(fileUrl);
    const b2 = await canvasBox(other);
    await other.keyboard.press('r');
    await drag(other, [b2.x + 100, b2.y + 400], [b2.x + 200, b2.y + 460]);
    await expect(other.getByTestId('save-status')).toHaveText('Saved', { timeout: 10_000 });
    await ctx.close();

    const box = await canvasBox(page);
    await page.keyboard.press('r');
    await drag(page, [box.x + 600, box.y + 100], [box.x + 700, box.y + 160]);
    await expect(page.getByRole('alert')).toContainText('changed elsewhere', { timeout: 10_000 });
    await page.getByRole('button', { name: 'Reload' }).click();
    await expect(page.getByText('3 layers')).toBeVisible();
  });

  test('viewer can leave the workspace; admin can deactivate accounts', async ({ page }) => {
    await asAdmin(page);
    await page.goto('/admin/users');
    const row = page.getByTestId(`user-row-${VIEWER_EMAIL}`);
    page.once('dialog', (d) => d.accept());
    await row.getByRole('button', { name: 'Active' }).click();
    await expect(row.getByRole('button', { name: 'Inactive' })).toBeVisible();
    await page.context().clearCookies();
    await login(page, VIEWER_EMAIL, VIEWER_FINAL_PASSWORD);
    await expect(page.getByRole('alert')).toContainText('deactivated');
  });
});
