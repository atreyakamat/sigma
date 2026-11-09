import { test } from '@playwright/test';
import { ADMIN_EMAIL } from '../e2e/global-setup';

const OUT = 'docs/images';

/** A small but realistic file: two phone screens built through the operations API. */
const DESIGN = [
  {
    op: 'add',
    type: 'FRAME',
    ref: 'home',
    name: 'Home',
    x: 0,
    y: 0,
    width: 390,
    height: 844,
    fill: '#f8fafc',
  },
  {
    op: 'add',
    type: 'TEXT',
    parent: '$home',
    name: 'Greeting',
    x: 24,
    y: 72,
    text: 'Good morning, Asha',
    fontSize: 26,
    fontWeight: 700,
    fill: '#0f172a',
  },
  {
    op: 'add',
    type: 'TEXT',
    parent: '$home',
    name: 'Subtitle',
    x: 24,
    y: 112,
    text: 'Here is what is happening today',
    fontSize: 15,
    fill: '#64748b',
  },
  {
    op: 'add',
    type: 'RECTANGLE',
    parent: '$home',
    name: 'Balance card',
    x: 24,
    y: 160,
    width: 342,
    height: 170,
    cornerRadius: 24,
    fill: '#4f46e5',
  },
  {
    op: 'add',
    type: 'TEXT',
    parent: '$home',
    name: 'Balance label',
    x: 48,
    y: 188,
    text: 'Total balance',
    fontSize: 14,
    fill: '#c7d2fe',
  },
  {
    op: 'add',
    type: 'TEXT',
    parent: '$home',
    name: 'Balance value',
    x: 48,
    y: 216,
    text: '₹ 84,250.00',
    fontSize: 34,
    fontWeight: 700,
    fill: '#ffffff',
  },
  {
    op: 'add',
    type: 'RECTANGLE',
    parent: '$home',
    name: 'Chip / income',
    x: 48,
    y: 276,
    width: 132,
    height: 34,
    cornerRadius: 17,
    fill: '#6366f1',
  },
  {
    op: 'add',
    type: 'TEXT',
    parent: '$home',
    name: 'Chip label',
    x: 66,
    y: 284,
    text: '+ 12% this month',
    fontSize: 12,
    fill: '#e0e7ff',
  },
  {
    op: 'add',
    type: 'TEXT',
    parent: '$home',
    name: 'Section title',
    x: 24,
    y: 362,
    text: 'Quick actions',
    fontSize: 17,
    fontWeight: 600,
    fill: '#0f172a',
  },
  {
    op: 'add',
    type: 'RECTANGLE',
    parent: '$home',
    name: 'Action / send',
    x: 24,
    y: 400,
    width: 102,
    height: 96,
    cornerRadius: 20,
    fill: '#e0e7ff',
  },
  {
    op: 'add',
    type: 'RECTANGLE',
    parent: '$home',
    name: 'Action / request',
    x: 144,
    y: 400,
    width: 102,
    height: 96,
    cornerRadius: 20,
    fill: '#dcfce7',
  },
  {
    op: 'add',
    type: 'RECTANGLE',
    parent: '$home',
    name: 'Action / scan',
    x: 264,
    y: 400,
    width: 102,
    height: 96,
    cornerRadius: 20,
    fill: '#fee2e2',
  },
  {
    op: 'add',
    type: 'ELLIPSE',
    parent: '$home',
    name: 'Icon / send',
    x: 57,
    y: 420,
    width: 36,
    height: 36,
    fill: '#4f46e5',
  },
  {
    op: 'add',
    type: 'ELLIPSE',
    parent: '$home',
    name: 'Icon / request',
    x: 177,
    y: 420,
    width: 36,
    height: 36,
    fill: '#16a34a',
  },
  {
    op: 'add',
    type: 'ELLIPSE',
    parent: '$home',
    name: 'Icon / scan',
    x: 297,
    y: 420,
    width: 36,
    height: 36,
    fill: '#dc2626',
  },
  {
    op: 'add',
    type: 'TEXT',
    parent: '$home',
    name: 'Label / send',
    x: 56,
    y: 466,
    text: 'Send',
    fontSize: 13,
    fill: '#312e81',
  },
  {
    op: 'add',
    type: 'TEXT',
    parent: '$home',
    name: 'Label / request',
    x: 166,
    y: 466,
    text: 'Request',
    fontSize: 13,
    fill: '#14532d',
  },
  {
    op: 'add',
    type: 'TEXT',
    parent: '$home',
    name: 'Label / scan',
    x: 298,
    y: 466,
    text: 'Scan',
    fontSize: 13,
    fill: '#7f1d1d',
  },
  {
    op: 'add',
    type: 'RECTANGLE',
    parent: '$home',
    name: 'Row / coffee',
    x: 24,
    y: 540,
    width: 342,
    height: 68,
    cornerRadius: 16,
    fill: '#ffffff',
    stroke: '#e2e8f0',
  },
  {
    op: 'add',
    type: 'TEXT',
    parent: '$home',
    name: 'Row title',
    x: 44,
    y: 556,
    text: 'Blue Tokai Coffee',
    fontSize: 15,
    fontWeight: 600,
    fill: '#0f172a',
  },
  {
    op: 'add',
    type: 'TEXT',
    parent: '$home',
    name: 'Row amount',
    x: 292,
    y: 564,
    text: '- ₹ 320',
    fontSize: 15,
    fill: '#dc2626',
  },
  {
    op: 'add',
    type: 'RECTANGLE',
    parent: '$home',
    name: 'Primary button',
    x: 24,
    y: 756,
    width: 342,
    height: 56,
    cornerRadius: 16,
    fill: '#0f172a',
  },
  {
    op: 'add',
    type: 'TEXT',
    parent: '$home',
    name: 'Button label',
    x: 150,
    y: 774,
    text: 'Add money',
    fontSize: 16,
    fontWeight: 600,
    fill: '#ffffff',
  },
  {
    op: 'add',
    type: 'FRAME',
    ref: 'send',
    name: 'Send money',
    x: 490,
    y: 0,
    width: 390,
    height: 844,
    fill: '#0f172a',
  },
  {
    op: 'add',
    type: 'TEXT',
    parent: '$send',
    name: 'Title',
    x: 24,
    y: 72,
    text: 'Send money',
    fontSize: 26,
    fontWeight: 700,
    fill: '#ffffff',
  },
  {
    op: 'add',
    type: 'ELLIPSE',
    parent: '$send',
    name: 'Avatar',
    x: 147,
    y: 150,
    width: 96,
    height: 96,
    fill: '#f59e0b',
  },
  {
    op: 'add',
    type: 'TEXT',
    parent: '$send',
    name: 'Recipient',
    x: 138,
    y: 266,
    text: 'Rohan Mehta',
    fontSize: 18,
    fontWeight: 600,
    fill: '#ffffff',
  },
  {
    op: 'add',
    type: 'TEXT',
    parent: '$send',
    name: 'Amount',
    x: 104,
    y: 340,
    text: '₹ 2,500',
    fontSize: 52,
    fontWeight: 700,
    fill: '#ffffff',
  },
  {
    op: 'add',
    type: 'RECTANGLE',
    parent: '$send',
    name: 'Note field',
    x: 24,
    y: 450,
    width: 342,
    height: 56,
    cornerRadius: 16,
    fill: '#1e293b',
  },
  {
    op: 'add',
    type: 'TEXT',
    parent: '$send',
    name: 'Note placeholder',
    x: 44,
    y: 468,
    text: 'Add a note',
    fontSize: 15,
    fill: '#94a3b8',
  },
  {
    op: 'add',
    type: 'RECTANGLE',
    parent: '$send',
    name: 'Confirm button',
    x: 24,
    y: 756,
    width: 342,
    height: 56,
    cornerRadius: 16,
    fill: '#22c55e',
  },
  {
    op: 'add',
    type: 'TEXT',
    parent: '$send',
    name: 'Confirm label',
    x: 148,
    y: 774,
    text: 'Send now',
    fontSize: 16,
    fontWeight: 700,
    fill: '#052e16',
  },
];

test('capture README screenshots', async ({ page, browser }) => {
  const anon = await (
    await browser.newContext({ viewport: { width: 1440, height: 900 } })
  ).newPage();
  await anon.goto('/login');
  await anon.getByLabel('Email').waitFor();
  await anon.screenshot({ path: `${OUT}/login.png` });

  await page.goto('/login');
  await page.getByLabel('Email').fill(ADMIN_EMAIL);
  await page.getByLabel('Password', { exact: true }).fill(process.env.E2E_ADMIN_PASSWORD as string);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await page.waitForURL((u) => !u.pathname.startsWith('/login'));
  const origin = new URL(page.url()).origin;
  const headers = { Origin: origin };
  const post = async (path: string, data: unknown) =>
    (await page.request.post(`${origin}/api/v1${path}`, { data, headers })).json();

  const ws = await post('/workspaces', { name: `Acme Design ${Date.now().toString(36)}` });
  const project = await post(`/workspaces/${ws.id}/projects`, { name: 'Wallet app' });
  const doc = await post(`/projects/${project.id}/documents`, { name: 'Wallet — mobile' });
  await post(`/documents/${doc.id}/ops`, { ops: DESIGN });
  const providers = await (await page.request.get(`${origin}/api/v1/admin/ai/providers`)).json();
  if (!providers.length)
    await post('/admin/ai/providers', { name: 'Demo assistant', kind: 'demo' });

  await page.goto(`/w/${ws.id}/p/${project.id}`);
  await page.getByText('Wallet — mobile').waitFor();
  await page.waitForTimeout(800);
  await page.screenshot({ path: `${OUT}/project.png` });

  await page.goto(`/file/${doc.id}`);
  await page.getByTestId('canvas-host').waitFor();
  await page.keyboard.press('Control+1');
  await page.waitForTimeout(1200);
  await page.locator('aside').first().getByText('Balance card').dispatchEvent('click');
  await page.waitForTimeout(500);
  await page.screenshot({ path: `${OUT}/editor.png` });

  await page.getByTestId('left-tab-assistant').click();
  await page.getByTestId('assistant-input').fill('add a teal circle named Status dot 40x40');
  await page.keyboard.press('Enter');
  await page.getByTestId('assistant-assistant').last().waitFor();
  await page.waitForTimeout(800);
  await page.screenshot({ path: `${OUT}/assistant.png` });

  await page.getByTestId('share-button').click();
  await page.getByTestId('create-share-link').click();
  await page.getByTestId('share-link-url').waitFor();
  await page.screenshot({ path: `${OUT}/share.png` });
  await page.keyboard.press('Escape');

  await page.goto(`/file/${doc.id}/preview`);
  await page.getByTestId('preview-frame').waitFor();
  await page.waitForTimeout(600);
  await page.screenshot({ path: `${OUT}/preview.png` });

  await page.goto('/admin/ai');
  await page.getByTestId('ai-providers-table').waitFor();
  await page.screenshot({ path: `${OUT}/ai-providers.png` });
});
