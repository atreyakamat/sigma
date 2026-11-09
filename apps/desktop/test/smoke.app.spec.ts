import { _electron as electron, expect, test } from '@playwright/test';
import type { ElectronApplication, Page } from '@playwright/test';
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { join, resolve } from 'node:path';

const appDir = resolve(__dirname, '..');
// Database clusters are large: keep test data inside the package and remove it afterwards.
const tmpRoot = resolve(__dirname, '..', '.tmp-app');
mkdirSync(tmpRoot, { recursive: true });
const dataDir = mkdtempSync(join(tmpRoot, 'sigma-app-'));
test.afterAll(() => rmSync(tmpRoot, { recursive: true, force: true }));

async function launch(): Promise<{ app: ElectronApplication; page: Page }> {
  // SIGMA_APP_EXECUTABLE points the same test at a packaged build instead of the source tree.
  const packagedExe = process.env.SIGMA_APP_EXECUTABLE;
  const app = await electron.launch({
    ...(packagedExe ? { executablePath: packagedExe } : {}),
    args: [...(packagedExe ? [] : [appDir]), '--no-sandbox', '--disable-gpu'],
    env: {
      ...process.env,
      SIGMA_DATA_DIR: dataDir,
      SIGMA_PLAIN_CONFIG: '1',
      ELECTRON_DISABLE_SECURITY_WARNINGS: '1',
    },
  });
  const page = await app.firstWindow();
  return { app, page };
}

test('first run: setup, draw, quit, relaunch, the work is still there', async () => {
  let { app, page } = await launch();
  await expect(page.getByTestId('setup-form')).toBeVisible({ timeout: 180_000 });
  if (process.env.SIGMA_SCREENSHOT_DIR)
    await page.screenshot({ path: join(process.env.SIGMA_SCREENSHOT_DIR, 'desktop-setup.png') });
  await page.getByLabel('Your name').fill('Asha Rao');
  await page.getByLabel('Email').fill('asha@example.com');
  await page.getByLabel('Password').fill('Tangerine-Harbour-42');
  await page.getByRole('button', { name: 'Start designing' }).click();

  await expect(page.getByTestId('canvas-host')).toBeVisible({ timeout: 30_000 });
  const box = (await page.getByTestId('canvas-host').boundingBox())!;
  await page.keyboard.press('r');
  await page.mouse.move(box.x + 300, box.y + 200);
  await page.mouse.down();
  await page.mouse.move(box.x + 460, box.y + 320, { steps: 6 });
  await page.mouse.up();
  await expect(page.locator('aside').first().getByText('Rectangle')).toBeVisible();
  await expect(page.getByTestId('save-status')).toHaveText('Saved', { timeout: 15_000 });
  const fileUrl = page.url();
  expect(
    await page.evaluate(
      () => typeof (window as unknown as { sigmaDesktop?: unknown }).sigmaDesktop,
    ),
  ).toBe('object');
  await app.close();

  ({ app, page } = await launch());
  await page.waitForURL(/127\.0\.0\.1/, { timeout: 120_000 });
  // The port can differ between launches when the preferred one is taken.
  await page.goto(new URL(new URL(fileUrl).pathname, page.url()).toString());
  await expect(page.locator('aside').first().getByText('Rectangle')).toBeVisible({
    timeout: 30_000,
  });

  // Forgotten password: the reset screen (menu → Reset password…) sets a new one and signs out.
  await page.goto(new URL('/desktop/reset-password', page.url()).toString());
  await page.getByLabel('New password', { exact: true }).fill('Brand-New-Secret-77');
  await page.getByLabel('Repeat new password').fill('Brand-New-Secret-77');
  await page.getByRole('button', { name: 'Set new password' }).click();
  await expect(page.getByTestId('reset-done')).toContainText('asha@example.com');
  await page.getByRole('link', { name: 'Sign in' }).click();
  await page.getByLabel('Email').fill('asha@example.com');
  await page.getByLabel('Password', { exact: true }).fill('Brand-New-Secret-77');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await page.waitForURL((u) => !u.pathname.startsWith('/login'));
  await app.close();
});
