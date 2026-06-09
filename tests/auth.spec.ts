import { expect, test } from '@playwright/test';

const demoEmail = 'demo@example.com';
const demoPassword = 'password123';

async function signIn(page: import('@playwright/test').Page) {
  await page.goto('/');
  await page.getByLabel('Email address').fill(demoEmail);
  await page.getByLabel('Password').fill(demoPassword);
  await page.keyboard.press('Enter');
}

test('authenticates with demo credentials and shows the protected dashboard', async ({ page }) => {
  await signIn(page);

  await expect(page).toHaveURL(/\/dashboard$/);
  await expect(page.getByRole('heading', { name: 'Command dashboard' })).toBeVisible();
  await expect(page.getByText('Signed in as demo@example.com')).toBeVisible();
});

test('rejects missing or invalid credentials without leaving the sign-in page', async ({ page }) => {
  await page.goto('/');
  await page.getByLabel('Password').focus();
  await page.keyboard.press('Enter');

  await expect(page.getByRole('alert')).toHaveText('Enter the demo email and password to continue.');
  await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Command dashboard' })).toBeHidden();

  await page.getByLabel('Email address').fill('wrong@example.com');
  await page.getByLabel('Password').fill('not-the-password');
  await page.keyboard.press('Enter');

  await expect(page.getByRole('alert')).toHaveText('Enter the demo email and password to continue.');
  await expect(page).not.toHaveURL(/\/dashboard$/);
});

test('redirects unauthenticated dashboard visits to the sign-in page', async ({ page }) => {
  await page.goto('/dashboard');

  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Command dashboard' })).toBeHidden();
});

test('signs out and prevents returning to the protected dashboard', async ({ page }) => {
  await signIn(page);
  await page.getByRole('button', { name: 'Sign out' }).focus();
  await page.keyboard.press('Enter');

  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible();

  await page.goto('/dashboard');
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByRole('heading', { name: 'Command dashboard' })).toBeHidden();
});

test('keeps the sign-in form accessible and labelled', async ({ page }) => {
  await page.goto('/');

  await expect(page.getByLabel('Email address')).toBeVisible();
  await expect(page.getByLabel('Password')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Sign in' })).toBeEnabled();
});
