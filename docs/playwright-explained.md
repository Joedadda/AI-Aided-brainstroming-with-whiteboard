# Playwright, explained for the prototype

Run `npm run test:e2e` from the Prototype folder to check private reports. The script uses the installed Google Chrome in headless mode, starts its own local server with sample AI replies, and saves test data only in memory. A failing run records a trace in `test-results/`.

Written for an interaction design student, not a software engineer. Plain words first, jargon defined when it appears.

## What Playwright is

Playwright is a tool that drives a real web browser by script. You write a short list of steps ("open the board, click this card, click that button, check this text appears"). Playwright opens Chrome (or Firefox, or Safari's engine), does those steps exactly as a person would, and tells you if anything went wrong.

Think of it as a very fast, very patient robot that uses your prototype the way you would, every time you ask.

## What it is NOT

- It is not a user-testing tool. It tells you nothing about whether people understand or like the design. Your real participants do that.
- It is not part of the shipped app. It lives in a separate folder of test files.
- Users never see it. The review panel, and anyone who later uses the app, will not know it exists.

It checks that the prototype works. It does not check that the design is good.

## Three ways it helps here

### 1. A smoke test of the demo loop before the review

A smoke test is one quick run through the main path to see if anything is on fire. One script walks the full demo:

board shows problem and cards, select cards, "Take cards with you", canvas opens with chips, chat, "Make report", "Approve", report lands on the board, switch viewer to Dev, read the report.

Run it the night before the review and again an hour before. If a late change broke the demo, you find out then, not in front of the panel.

### 2. Automated checks for accessibility and layout

Your brief says everything works from the keyboard, the minimum width is 1024 px, and contrast matters. Playwright can check some of this for you:

- Keyboard reachability: press Tab repeatedly and confirm that "Take cards with you", "Make report" and "Approve" can be reached and activated without a mouse.
- Viewport widths: open the app at 1024, 1280 and 1440 px wide and confirm nothing is cut off or overlapping (for example, the button is still visible).
- Screenshots: save a picture of each key screen at each width. These are useful for your thesis documentation and for spotting layout drift by eye.

It cannot judge whether the layout looks good. It can only catch things that are clearly broken or missing.

### 3. Letting the AI coding agent check its own work

When an AI coding agent edits the code, it normally cannot see the result. With Playwright it can open the app in a real browser, click through, and read what happened. That means fewer rounds of "it said it was fixed, but the button does nothing".

## How AI calls are handled in tests

The app talks to the Anthropic API through your small Express server, using two routes: `/chat` and `/report`. Calling the real AI in every test would be slow, cost money, and give a different answer each time, which makes tests unreliable.

So in tests, Playwright intercepts those two routes and answers with fixed, pre-written replies. This is called mocking (standing in a fake for the real thing).

- Fast: no waiting for the model.
- Free: no API charges.
- Repeatable: same reply every run, so a failure always means something real broke.

Optionally, keep one separate "live" test that uses the real API, and run it by hand once before the review to confirm the real connection and key still work. Do not run it on every change.

## What it costs you

- One dev dependency (a package used only while building, not shipped): `@playwright/test`.
- A one-time download of browser engines, which Playwright does with one command.
- A few minutes to set up, and a few minutes to write the first test. The sample below is most of the work.

With 3 days left, aim for just the smoke test (way 1) first. Add the rest only if time allows.

## How you run it

One-time setup, from the project folder:

```
npm install -D @playwright/test
npx playwright install chromium
```

Add this line to the `scripts` section of `package.json`:

```
"test:e2e": "playwright test"
```

Then, any time:

```
npm run test:e2e
```

It runs the tests, prints pass or fail, and if something fails it saves a screenshot and a report you can open. ("e2e" means end to end: the whole path, from the first click to the last result.)

Playwright can also start your dev server for you. This is set in `playwright.config.ts` under `webServer`, so you do not have to remember to start the app first.

## Sample test: the "Take cards with you" step

Save as `e2e/take-cards.spec.ts`. The words in quotes (button names, headings) must match the real labels in your app. Adjust them if yours differ.

```ts
import { test, expect } from '@playwright/test';

test('taking cards opens a private canvas with context chips', async ({ page }) => {
  // Replace the real AI with a fixed reply, so the test is fast, free and repeatable.
  await page.route('**/chat', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ reply: 'Here are two directions to consider.' }),
    });
  });

  // Open the app (the base address is set in playwright.config.ts).
  await page.goto('/');

  // The board should show the problem statement at the top.
  await expect(page.getByRole('heading', { name: /problem/i })).toBeVisible();

  // Select two cards, the way a person would click them.
  await page.getByRole('button', { name: /card/i }).nth(0).click();
  await page.getByRole('button', { name: /card/i }).nth(1).click();

  // Click the main action.
  await page.getByRole('button', { name: 'Take cards with you' }).click();

  // The private canvas should now be open...
  await expect(page.getByRole('region', { name: /private canvas/i })).toBeVisible();

  // ...and show read-only chips for the problem plus the two cards.
  // (Check the chips are plain text, not editable fields.)
  const chips = page.getByTestId('context-chip');
  await expect(chips).toHaveCount(3);

  // Optional: confirm the chat works with the fake reply.
  await page.getByRole('textbox', { name: /message/i }).fill('Give me alternatives');
  await page.keyboard.press('Enter');
  await expect(page.getByText('Here are two directions to consider.')).toBeVisible();
});
```

If a line cannot find an element, the usual fix is to give that element a clear label or a `data-testid` attribute in the code. That also tends to help screen readers, so it is worth doing anyway.

## Bottom line

Playwright is a safety net for the demo, not a design method. It costs a few minutes, it never appears in the product, and its biggest value for you is one run the night before the review that says "the loop still works".
