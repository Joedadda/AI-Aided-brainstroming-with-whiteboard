# Split Buddy handouts

For the fresh case ("Start a fresh case" on the start screen). Print this page, or send each person only their own section.

The case content lives in `server/cases/split-buddy.ts`. If you change a fact there, change it here too.

## Who holds what

| People | Who holds what |
|---|---|
| 1 | One person holds all three handouts, and explores in three separate private canvases. |
| 2 | Person 1 holds Asha and Kavya. Person 2 holds Dev. This is easier than the designed case: two handouts together already favour option C. |
| 3 | One handout each: Kavya, Dev, Asha. This is the designed case. |
| 4 | Three people hold one handout each. The fourth is Meera, the lead. She holds no private facts, reads the reports and leads the decision. |

When you join, type your role's name (Kavya, Dev, Asha or Meera) as your profile name.

## How to use your handout

1. On the board, restate the problem in your own words on a note in the "Restate the problem" section. About two minutes.
2. Select some notes and click **Take cards with you**.
3. In your private canvas, click **Add your own context**. Paste your text note and click **Add**. Then add your link the same way. Add handout 2 when the facilitator hands it out.
4. Only then, ask the AI anything.

Your handout stays in your private canvas. Nobody else on the board can see it. The links are fictional, so the app cannot read them and keeps each one as a reference only. Every fact is in the text note.

---

## Facilitator: project context

Add these four items through **Context** (the paperclip in the left sidebar) before the session, or ask the group to add them as their first task. Paste each block on its own and click **Add**. Everyone on the board sees these.

```
About Split Buddy. Split Buddy is a mobile app for flatmates. People log shared expenses, such as rent, groceries and internet, and the app shows who owes whom. A new user goes through a six-step setup: 1 sign up, 2 name your home, 3 choose a currency, 4 invite flatmates, 5 add your first expense, 6 choose split rules.
```

```
This sprint. Team: Asha (product manager), Dev (software engineer), Kavya (product designer). One two-week sprint. We can ship one fix. Goal: more new users still using Split Buddy after their first week.
```

```
How we measure it. A new user counts as retained if they log a second expense within 7 days of signing up. Right now about 4 in 10 new users are retained, so about 6 in 10 stop.
```

```
Setup funnel dashboard (week-one drop-off): https://splitbuddy.example/dashboard/setup-funnel. Excerpt: The biggest drop happens in the first session, during setup.
```

---

## Kavya, product designer

Text note. Paste it as one block:

```
You are Kavya, the product designer on the Split Buddy team. These are your usability test notes.
- In 8 usability tests of the current onboarding, 7 people finished it without trouble.
- In the same tests, 5 of 8 stalled when asked to invite flatmates, and most skipped it.
- Several testers said daily reminders would annoy them.
- Redrawing the invite screen is about two days of design work.
```

Link, "Usability test recordings":

```
https://splitbuddy.example/research/usability-tests
```

Handout 2, "More from the usability tests". Hand it out once the group has picked an option, or with handout 1 if the session is short. Paste it as one block:

```
You are Kavya, the product designer on the Split Buddy team. These are more usability test notes, handed out once option C is on the table.
- Of the 5 testers who stalled on the invite step, 3 said they did not know yet whom to invite or their flatmates were not around. The other 2 were on Android and got an error when sharing.
- "Skip" is small grey text. 4 of the 5 who stalled took over a minute to find it, and 1 quit the test.
- All 3 testers who actually sent an invite had a flatmate in the room at the time.
- 6 of 8 testers said a weekly summary of who owes what would be fine. Daily reminders were the problem.
- The 8 testers were recruited by email from existing users, so they are more committed than a typical new sign-up.
- 3 of 8 testers asked how they would invite someone later.
```

---

## Dev, software engineer

Text note. Paste it as one block:

```
You are Dev, the software engineer on the Split Buddy team. These are your engineering notes.
- In the logs, 9 in 10 users who reach the last onboarding step finish it.
- The invite link fails to open the app on about 1 in 3 Android phones.
- Reminders only work if people allow notifications, and about 40 percent of new users decline.
- The link fix is about three days of work, plus a few days for an app store release.
```

Link, "Invite link bug ticket":

```
https://splitbuddy.example/tickets/invite-link
```

Handout 2, "More engineering notes". Hand it out once the group has picked an option, or with handout 1 if the session is short. Paste it as one block:

```
You are Dev, the software engineer on the Split Buddy team. These are more engineering notes, handed out once option C is on the table.
- "A third" comes from 12 Android phones from the office drawer: on 4 of them the link opened the website instead of the app.
- When the link opens the website, the invite code is lost, so the flatmate cannot join even after installing the app.
- After someone skips the invite, the only way back is Settings, then Home, then Members: three taps. Nothing prompts them later.
- A three-step onboarding would merge the name, currency and split-rule screens. The invite step would stay exactly as it is.
- Android is about 4 in 10 new users.
- The app logs that someone finished the invite step, but not whether a link was sent, opened or accepted.
- iPhone review takes 1 to 2 days. An Android release reaches everyone in about a week.
```

---

## Asha, product manager

Text note. Paste it as one block:

```
You are Asha, the product manager on the Split Buddy team. These are your product notes.
- Both reviews calling setup "confusing" also mention the invite not working.
- Users who invite at least one flatmate in week one are about 4 times more likely to still be active after a month.
- Early users who got the reminder email logged an expense about 10 percent more often.
- Reminders only reach people who have already added an expense, so they cannot help someone who stalls at setup.
```

Link, "App store reviews, this month":

```
https://splitbuddy.example/reviews/this-month
```

Handout 2, "More product notes". Hand it out once the group has picked an option, or with handout 1 if the session is short. Paste it as one block:

```
You are Asha, the product manager on the Split Buddy team. These are more product notes, handed out once option C is on the table.
- Of 100 people who sign up: 95 pass step 2, 92 pass step 3, 59 pass the invite step, 53 add a first expense, 47 finish step 6, and 40 are retained. The invite step loses 33 of the 60 who stop.
- Of people who skip the invite, about 1 in 8 invite later, and most do it right after adding their first expense.
- The "4 times" number compares two groups. It is not an experiment, and committed users may simply be the ones who invite.
- Invite-step completion is about 7 in 10 on iPhone and under 6 in 10 on Android.
- A competing app launched streaks in October, and one reviewer on its page praised them.
```

---

## Meera, lead (four-person sessions only)

You hold no private facts. Read the reports as they land. Your task: "Find out why option A was set aside, without asking the person who wrote the report." Then lead the group in agreeing a decision with its reasons. When the group agrees, lock it on the board: **Lock a decision** in the Decisions area, with the reasons and the reports behind it.
