import { expect, test } from '@playwright/test';

test('blank board offers both context sources and a meeting fills the Problem', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('textbox', { name: 'Your name on the board' }).fill('Facilitator');
  await page.getByRole('button', { name: 'Start', exact: true }).click();
  await page.getByRole('button', { name: 'Start a new board' }).click();

  const meeting = page.getByRole('region', { name: 'Add meeting context' });
  const other = page.getByRole('region', { name: 'Add other context' });
  await expect(meeting).toBeInViewport();
  await expect(other).toBeInViewport();
  await other.getByRole('button', { name: 'Add other context' }).click();
  await expect(page.getByRole('textbox', { name: 'Add context' })).toBeVisible();
  await other.getByRole('button', { name: 'Skip other context' }).click();
  await expect(other).toHaveCount(0);
  await meeting.getByRole('button', { name: 'Add meeting context' }).click();
  await page.getByRole('textbox', { name: 'Meeting transcript or summary' }).fill([
    'Mira: The critique focused on the onboarding screen and the labels used on its first two steps.',
    'Dev: The progress indicator is too subtle and people missed the step count when reviewing the prototype.',
    'Mira: We also noticed the primary action and the skip link are hard to distinguish at a glance.',
    'Dev: The welcome headline is clear, and the activity illustration can stay as it is.',
  ].join('\n'));
  await page.getByRole('button', { name: 'Add and build session' }).click();
  const proposed = page.getByRole('textbox', { name: 'Problem statement' });
  await expect(proposed).toHaveValue(/\?$/);
  const question = await proposed.inputValue();
  await page.getByRole('button', { name: 'Add to board' }).click();
  await expect(page.locator('#problem-field')).toHaveValue(question);
  await expect(meeting).toHaveCount(0);
});

test('the first written note clears the blank-board context prompts', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('textbox', { name: 'Your name on the board' }).fill('Note Editor');
  await page.getByRole('button', { name: 'Start', exact: true }).click();
  await page.getByRole('button', { name: 'Start a new board' }).click();
  const meeting = page.getByRole('region', { name: 'Add meeting context' });
  const other = page.getByRole('region', { name: 'Add other context' });
  await expect(meeting).toBeVisible();
  await expect(other).toBeVisible();
  await page.getByRole('heading', { name: 'Core question' }).click();
  await page.keyboard.press('s');
  await page.keyboard.press('Enter');
  const editor = page.getByRole('textbox', { name: 'Sticky note text' });
  await editor.fill('Start with the onboarding critique.');
  await editor.press('Escape');
  await expect(meeting).toHaveCount(0);
  await expect(other).toHaveCount(0);
  await expect(page.locator('#problem-field')).toBeVisible();
  await page.reload();
  await expect(page.locator('#problem-field')).toBeVisible();
  await expect(meeting).toHaveCount(0);
  await expect(other).toHaveCount(0);
});

test('the selection toolbar locks and unlocks the same note', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('textbox', { name: 'Your name on the board' }).fill('Note Editor');
  await page.getByRole('button', { name: 'Start', exact: true }).click();
  await page.getByRole('button', { name: 'Start a sample case' }).click();
  await page.getByRole('button', { name: 'Fit to content' }).click();
  await page.getByText('Option A. Cut onboarding from six steps to three.', { exact: true }).click();
  await page.getByRole('textbox', { name: 'Sticky note text' }).press('Escape');

  const toolbar = page.locator('.react-flow__node-toolbar');
  const lock = toolbar.getByRole('button', { name: 'Lock', exact: true });
  const unlock = toolbar.getByRole('button', { name: 'Unlock', exact: true });
  await lock.click();
  await unlock.click();
  await expect(lock).toBeEnabled();
  await lock.click();
  await expect(unlock).toBeEnabled();
});

test('a sticky note fits long text while editing and after reopening the board', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('textbox', { name: 'Your name on the board' }).fill('Note Editor');
  await page.getByRole('button', { name: 'Start', exact: true }).click();
  await page.getByRole('button', { name: 'Start a sample case' }).click();
  await page.getByRole('button', { name: 'Fit to content' }).click();

  const original = 'Option A. Cut onboarding from six steps to three.';
  const note = page.locator('.sticky-note').filter({ hasText: original });
  const initialHeight = await note.evaluate((el) => el.clientHeight);
  await note.getByText(original, { exact: true }).click();

  const editor = page.getByRole('textbox', { name: 'Sticky note text' });
  const longText = [
    original,
    'A longer note should show its last line without scrolling.',
    'LongUnbrokenText'.repeat(15),
    'Last line of the note.',
  ].join('\n');
  await editor.fill(longText + '\n');
  await expect.poll(() => note.evaluate((el) => el.clientHeight)).toBeGreaterThan(initialHeight);
  await expect.poll(() => editor.evaluate((el) => el.scrollHeight - el.clientHeight)).toBeLessThanOrEqual(1);

  await editor.fill(original);
  await expect.poll(() => note.evaluate((el) => el.clientHeight)).toBe(initialHeight);
  await editor.fill(longText);
  await editor.press('Escape');
  await expect(note.locator('p.sticky-copy')).toHaveText(longText);

  await page.reload();
  await page.getByRole('button', { name: 'Fit to content' }).click();
  await expect(note.locator('p.sticky-copy')).toHaveText(longText);
  await expect.poll(() => note.evaluate((el) => el.clientHeight)).toBeGreaterThan(initialHeight);
});
