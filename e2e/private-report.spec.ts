import { expect, test, type Page } from '@playwright/test';

const selectedNote = 'Option A. Cut onboarding from six steps to three.';
const decision = 'Test the shorter onboarding before committing to it.';

async function join(page: Page, url: string, name: string) {
  await page.goto(url);
  await page.getByRole('textbox', { name: 'Your name on the board' }).fill(name);
  await page.getByRole('button', { name: 'Start', exact: true }).click();
}

async function openCase(page: Page) {
  await join(page, '/', 'Report Author');
  await page.getByRole('button', { name: 'Start a sample case' }).click();
  await expect(page.getByRole('application', { name: 'Board canvas' })).toBeVisible();
  await expect(page).toHaveURL(/\/b\/[\w-]+$/);
}

async function selectNote(page: Page) {
  await page.getByRole('button', { name: 'Fit to content' }).click();
  await page.getByText(selectedNote, { exact: true }).click();
}

async function send(page: Page, text: string) {
  const composer = page.getByRole('textbox', { name: 'Message the Agent' });
  await composer.fill(text);
  await page.getByRole('button', { name: 'Send', exact: true }).click();
}

async function discussObjections(page: Page) {
  await send(page, 'What are the strongest objections?');
  await expect(page.getByRole('log').getByText(/The strongest objections:/)).toBeVisible();
}

async function expectSelectedNote(page: Page) {
  const notes = page.locator('details').filter({ has: page.locator('summary').filter({ hasText: /^Selected notes/ }) });
  await expect(notes.locator('summary')).toHaveText('Selected notes 1');
  await notes.locator('summary').click();
  await expect(notes.getByRole('listitem')).toHaveCount(1);
  await expect(notes.getByRole('listitem')).toContainText(selectedNote);
}

test('report decision sessions stay private to their owner', async ({ page, browser }) => {
  await join(page, '/', 'Decision Author');
  await page.getByRole('button', { name: 'See a finished example' }).click();
  await expect(page).toHaveURL(/\/b\/[\w-]+$/);
  const boardUrl = page.url();
  await page.getByRole('button', { name: 'Fit to content' }).click();
  const reports = page.getByRole('checkbox', { name: /^Select report / });
  await expect(reports.first()).toBeVisible();
  const reportTitle = (await reports.first().getAttribute('aria-label'))!.replace('Select report ', '');
  await reports.first().check();
  await page.getByRole('button', { name: 'Talk it through' }).click();
  const evidence = page.getByRole('region', { name: 'What the AI was given' });
  await expect(evidence.getByText(reportTitle, { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Draft decision' })).toBeVisible();
  const sessionUrl = page.url();
  const sessionId = sessionUrl.split('/').at(-1)!;

  const other = await browser.newPage();
  try {
    const list = other.waitForResponse((response) => response.url().endsWith('/sessions'));
    await join(other, boardUrl, 'Dev');
    expect(await (await list).json()).toEqual({ sessions: [] });
    const denied = other.waitForResponse((response) => response.url().endsWith(`/api/explorations/${sessionId}`));
    await other.goto(sessionUrl);
    expect((await denied).status()).toBe(404);
    await expect(other.getByText(/This private canvas belongs to someone else/)).toBeVisible();
    expect(other.url()).toContain(sessionId);
  } finally {
    await other.close();
  }

  await page.getByRole('button', { name: 'Draft decision' }).click();
  await expect(page.getByRole('textbox', { name: 'Decision', exact: true })).not.toHaveValue('');
  await page.getByRole('textbox', { name: 'Decision', exact: true }).fill('Test the invite flow first.');
  await page.getByRole('button', { name: 'Lock decision', exact: true }).click();
  await expect(page).toHaveURL(/\/decision\//);
  await page.goto(boardUrl);
  const rail = page.getByRole('button', { name: /Core question, 1 item/ });
  await expect(rail).toBeVisible();
  if ((await rail.getAttribute('aria-expanded')) === 'false') await rail.click();
  const sessions = page.getByRole('region', { name: 'Your sessions' });
  await expect(sessions.getByText('Decision locked')).toBeVisible();
  await expect(sessions.getByText(/1 report/)).toBeVisible();

  await page.getByRole('button', { name: 'Fit to content' }).click();
  await reports.first().check();
  await page.getByRole('button', { name: 'Draft now' }).click();
  await expect(page.getByRole('textbox', { name: 'Decision', exact: true })).not.toHaveValue('');
  const draftUrl = page.url();
  await page.getByRole('button', { name: 'Close canvas' }).click();
  const draftRow = sessions.getByRole('listitem').filter({ hasText: 'Draft ready' });
  await expect(draftRow).toBeVisible();
  await draftRow.getByRole('button', { name: /^Options for/ }).click();
  page.once('dialog', (dialog) => void dialog.accept());
  await page.getByRole('menuitem', { name: 'Discard' }).click();
  await expect(draftRow).toHaveCount(0);
  await page.goto(draftUrl);
  await expect(page.getByText(/This private canvas belongs to someone else/)).toBeVisible();
});

test('a typed question from the sparkle popover continues in the Agent sidebar', async ({ page }) => {
  await openCase(page);
  await selectNote(page);
  await page.getByRole('textbox', { name: 'Sticky note text' }).press('Escape');
  await page.getByText('Option B. Add reminders and streaks to bring people back.', { exact: true })
    .click({ modifiers: ['Shift'] });
  const selected = page.locator('.react-flow__node-sticky.selected');
  await expect(selected).toHaveCount(2);
  const noteIds = await selected.evaluateAll((nodes) => nodes.map((node) => node.getAttribute('data-id')));
  await page.getByRole('button', { name: 'Ask the agent', exact: true }).click();
  await expect(page.getByRole('button', { name: 'What is strong here' })).toBeVisible();
  const question = page.getByRole('textbox', { name: 'Your own question' });
  await question.fill('What are the strongest objections?');
  const request = page.waitForRequest((r) =>
    r.method() === 'POST' && /\/api\/explorations\/[^/]+\/messages$/.test(r.url()));
  await question.press('Enter');

  expect((await request).postDataJSON()).toMatchObject({
    content: 'What are the strongest objections?',
    noteIds: expect.arrayContaining(noteIds),
  });
  await expect(question).toBeHidden();
  const preview = page.getByTestId('selected-note-preview');
  await expect(preview).toBeVisible();
  await expect(preview.locator('[data-color]')).toHaveCount(2);
  await expect(preview.locator('[data-color]')).toHaveText(['#idea1', '#idea2']);
  await expect(preview.getByText('#idea1', { exact: true })).toHaveCSS('color', 'rgba(0, 0, 0, 0.4)');
  await expect(page.getByText('Working on: 2 selected notes')).toBeVisible();
  await expect(page.getByRole('log').getByText(/The strongest objections:/)).toBeVisible();
  await expect(page.getByRole('textbox', { name: 'Message the Agent' })).toBeFocused();
  await page.locator('.react-flow__pane').click({ position: { x: 8, y: 8 } });
  await expect(preview).toHaveCount(0);
  await expect(page.getByText('Working on: the whole board')).toBeVisible();
});

test('a typed request opens a private, compact report and the decision survives saving and sharing', async ({ page, browser }) => {
  await openCase(page);
  const boardUrl = page.url();
  await selectNote(page);
  await page.getByRole('button', { name: 'Explore privately' }).click();
  await discussObjections(page);

  await send(page, 'Sounds good. Can you make a report?');
  const draft = page.getByRole('dialog', { name: 'Draft report' });
  await expect(draft).toBeVisible();
  await expect(draft.getByRole('textbox', { name: 'Report title' })).toHaveValue(/exploration so far/);
  await expectSelectedNote(page);
  await expect(draft.getByRole('textbox', { name: 'Objection 1' })).toBeVisible();
  await expect(draft.getByRole('textbox', { name: 'Objection 2' })).toHaveCount(0);

  const decisionField = draft.getByRole('textbox', { name: 'Decision (optional)' });
  await expect(decisionField).toBeEmpty();
  await decisionField.fill(decision);
  await expect(draft.getByText(/Changes saved/)).toBeVisible();
  const privateUrl = page.url();

  const observer = await browser.newPage();
  try {
    await join(observer, privateUrl, 'Board Reader');
    await expect(observer.getByText(/This private canvas belongs to someone else/)).toBeVisible();
    await observer.goto(boardUrl);
    await expect(observer.getByRole('application', { name: 'Board canvas' })).toBeVisible();
    await observer.getByRole('button', { name: 'Fit to content' }).click();
    await expect(observer.getByText(/No reports yet/)).toBeVisible();

    await page.reload();
    await page.getByRole('button', { name: 'Review draft' }).click();
    await expect(decisionField).toHaveValue(decision);
    page.once('dialog', (dialog) => dialog.accept());
    const regeneration = page.waitForResponse((response) =>
      response.request().method() === 'POST' && /\/api\/explorations\/[^/]+\/report$/.test(response.url()));
    await draft.getByRole('button', { name: 'Regenerate' }).click();
    expect((await regeneration).ok()).toBe(true);
    await expect(decisionField).toHaveValue(decision);

    await draft.getByRole('button', { name: 'Approve and share' }).click();
    const sharedReport = observer.getByRole('button', { name: /1 note .*exploration so far/ });
    await expect(sharedReport).toBeVisible();
    await sharedReport.click();
    await expect(observer.getByRole('region', { name: 'Decision', exact: true })).toContainText(decision);
    await expectSelectedNote(observer);
  } finally {
    await observer.close();
  }
});

for (const withSelection of [true, false]) {
  test(`the sidebar drafts a report ${withSelection ? 'from its selected note' : 'with no selected notes'}`, async ({ page }) => {
    await openCase(page);
    if (withSelection) await selectNote(page);
    await page.getByRole('button', { name: 'Agent', exact: true }).click();
    await discussObjections(page);
    await send(page, 'Okay, draft a report now.');
    const draft = page.getByRole('dialog', { name: 'Draft report' });
    await expect(draft.getByRole('textbox', { name: 'Report title' })).toHaveValue(/exploration so far/);
    if (withSelection) await expectSelectedNote(page);
    else await expect(draft.getByText('Selected notes', { exact: true })).toHaveCount(0);
    await expect(draft.getByRole('textbox', { name: 'Decision (optional)' })).toBeEmpty();
  });
}
