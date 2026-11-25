# Model comparison

Run 2026-11-24T13:45:30.101Z. Each task uses its own reasoning setting and token limit from `server/models.config.ts`.

## 1. Canvas chat, turn 1

| Model | Latency | Tokens |
|---|---|---|
| gemma4 | 563 ms | 429 in, 115 out |
| glm5.3-flash | 1729 ms | 405 in, 275 out |
| deepseekv4.1-flash-1017 | 2420 ms | 399 in, 335 out |

### gemma4

1. Manual Entry: Let users enter expenses by hand first. This removes the bank-linking barrier immediately (Note 1).

2. Value Demonstration: Use fake data to show a sample budget. This lets users see the product's value before they provide any data (Note 2).

3. Trust Building: Address the security concerns of the 61% who distrust the login process. This targets the specific reason for churn found in the survey (Note 3).

Which of these directions aligns best with the current technical capabilities of the app?

### glm5.3-flash

Three directions, each with a reason:

1. **Manual first, link later (Meera's note)**. Reason: Dev's survey says trust is the blocker at 61%. Hand-adding a few expenses skips the bank login entirely, so people reach value before being asked for credentials. Weak point: manual entry is tedious and they may churn later at the same wall.

2. **Show the payoff before setup (Asha's note)**. Reason: a sample budget with realistic fake data lets people see what they get in minute one, which may make the link feel worth it. Weak point: fake data can feel dishonest or irrelevant, and it still doesn't solve the trust problem itself.

3. **Attack the trust problem directly at the linking step**. Reason: none of the notes address why people distrust it. Options worth exploring: explain in plain words what the app can and cannot see, show the security provider used, offer a "link one account" option instead of all accounts, or defer the ask until after a first session. Weak point: this is a draft direction with no evidence yet about which trust fix would actually move people.

Open question: the 61% figure comes from people who already quit. Do you know whether people who do complete linking say what convinced them? That would tell you which direction has the best odds.

### deepseekv4.1-flash-1017

Three directions, each taking a different view of the problem:

**1. Reorder the first session (Meera's line).**
Let people log a few expenses by hand and see a working budget before any bank link. The link becomes an upgrade, not a gate.
Reason: it removes the step where people leave. Open question: will hand-entered users come back to link later, or stay manual forever?

**2. Sell the payoff before the ask (Asha's line).**
Show a sample budget with realistic fake data so people see what they get. Trust is the stated blocker (Dev's survey), and a demo can build it before any login is requested.
Reason: it answers "what is this for" before "give me your bank." Open question: does a demo actually move trust, or just delay the drop-off to the next screen?

**3. Attack the trust objection directly (Dev's line).**
61% of 212 say they do not trust a new app with their bank login. That is the biggest single reason in the data. Options include read-only access framing, a security explainer, or a trusted third-party link.
Reason: it targets the stated cause, not the symptom. Objection: 212 self-selected replies may not represent all 40%, and "do not trust yet" may mean "not convinced this app is worth it," not a security fear.

These are not exclusive. Direction 1 and 2 could run together.

One question back: is the 40% drop mostly people who never intended to link, or people who tried and failed? That changes which direction matters most.

## 2. Canvas chat, turn 2

| Model | Latency | Tokens |
|---|---|---|
| gemma4 | 1210 ms | 559 in, 113 out |
| glm5.3-flash | 1820 ms | 688 in, 292 out |
| deepseekv4.1-flash-1017 | 3450 ms | 743 in, 366 out |

### gemma4

1. Manual Entry: Users may find manual input tedious. This could lead to a different type of churn if they find the work too high (General knowledge).

2. Value Demonstration: Fake data is not personal. Users might ignore the sample budget because it does not reflect their own financial reality (General knowledge).

3. Trust Building: Explaining security may not be enough. Some users may never trust a new app with their login regardless of the messaging (General knowledge).

Do we know if the users who leave are mostly on mobile or desktop?

### glm5.3-flash

Strongest objections:

1. Against manual-first: 40% leave before seeing value. If manual entry is also work, you may just move the drop-off point. And Dev's survey only covers people who reached the linking step; it tells you nothing about whether those users wanted budgeting at all.

2. Against the sample budget demo: fake data shows what the app looks like, not what it does for the user's own money. People who churn over trust may not be persuaded by anything they know is fake.

3. Against trust fixes at the link step: the 61% figure is from an exit survey of 212 people who already quit. People who abandon often give the easiest answer, so the real reason could be effort, timing, or low intent rather than trust. You would risk fixing the wrong thing.

4. Against the whole framing: 40% drop-off at one step is a symptom. Nobody on the board has checked where users come from or whether they understood the app before reaching that step. Any fix built on this framing could miss the actual cause.

Biggest one in my view: objection 4. All three directions assume the survey answer is the real reason. That is unverified.

Question back: do you have data on how long users spend on the linking step before leaving? That would help separate "hesitating over trust" from "confused or unwilling."

### deepseekv4.1-flash-1017

Strongest objections, one per direction:

**1. Reorder the first session**
- Manual entry may just move the drop-off. People who wanted automatic tracking may quit at "type in your expenses" instead.
- It may undercut the product. A budgeting app's value is often the automatic sync. Hand entry can look like a worse app.
- No evidence yet that manual users ever link. If they don't, you have a bigger manual-entry problem later.

**2. Sample budget with fake data**
- It may not touch the real blocker. Dev's survey says trust in the bank login, not confusion about value. A demo does not answer "is my login safe."
- It risks feeling like a toy. Fake data can read as "this isn't my money, so it isn't real."
- It may just delay the drop-off to the next screen rather than remove it.

**3. Attack the trust objection**
- The 212 replies are self-selected. People who fill in exit surveys may skew toward the distrustful. The 61% may overstate the real share.
- "Do not trust yet" is ambiguous. It could mean a security fear, or "I'm not sure this app is worth my login." Those need different fixes.
- Security explainers are weak on their own. Telling people "we're safe" rarely changes minds. A third-party link is a bigger build and may not be available.

The common objection across all three: none of them is tested against the actual 40%. The team is reasoning from one survey and three opinions. Before committing, it would help to know whether the drop is refusal, failure, or abandonment.

Question back: can you get any data on what people do at that step, not just what they say afterward?

## 3. Selected-notes question

| Model | Latency | Tokens |
|---|---|---|
| gemma4 | 479 ms | 573 in, 48 out |
| glm5.3-flash | 810 ms | 536 in, 175 out |
| deepseekv4.1-flash-1017 | 1580 ms | 532 in, 167 out |

### gemma4

[N2] identifies a trust issue, as 61% of surveyed users do not trust the app with their bank login. [N1] proposes a solution to this by letting users enter expenses manually before linking a bank.

### glm5.3-flash

These three notes point at the same blocker: trust and effort at the bank-linking step.

- [N2] gives the reason: most people who leave say they do not trust a new app with their bank login yet.
- [N1] is a direct response to that: let people add expenses by hand first, so they get value before being asked to link a bank. This removes the trust demand from the first moment.
- [N3] supports [N1]: if linking is painful (wrong categories, day 3 tickets), doing it early hurts. Deferring it also defers that pain.

In short: [N2] explains why people drop off, and [N1] and [N3] both suggest moving or softening the linking step, though [N3] focuses on fixing the experience rather than delaying it.

### deepseekv4.1-flash-1017

[N1] and [N2] point at the same problem from two sides. [N2] gives the reason people stop: 61% of 212 replies say they do not trust a new app with their bank login yet. [N1] gives a way around it: let people add expenses by hand first and link later. So [N1] is a direct response to the trust barrier in [N2]. It lets people reach value without the step they distrust.

One caution: [N2] is a self-selected exit survey, so it shows a reason people gave, not proof it is the main cause. Treat the link as a working hypothesis, not a finding.

Open question: does hand entry alone get people through the first week, or do they still need a reason to link later?

## 4. Report

| Model | Latency | Tokens |
|---|---|---|
| gemma4 | 2607 ms | 613 in, 556 out |
| glm5.3-flash | 2080 ms | 741 in, 867 out |
| deepseekv4.1-flash-1017 | 9272 ms | 1421 in, 1257 out |

### gemma4

(json_schema)

```json
{
  "title": "Bank-Linking Churn Report",
  "summary": "About 40% of new users leave the app during bank linking. Survey data shows 61% of those users distrust the login process. The team is exploring manual entry, sample budgets, and trust-building measures to reduce churn.",
  "findings": [
    {
      "text": "A large number of users leave the app at the bank-linking step.",
      "reason": "The team framed the problem as 40% of new users leaving at this step (Context)."
    },
    {
      "text": "Lack of trust in the login process is a primary driver of churn.",
      "reason": "An exit survey of 212 replies showed 61% of users do not trust the app with their bank login (Note 3)."
    },
    {
      "text": "Manual entry of expenses can remove the bank-linking barrier.",
      "reason": "Meera suggested letting users add expenses by hand first (Note 1)."
    },
    {
      "text": "Sample budgets with fake data can demonstrate value before setup.",
      "reason": "Asha suggested showing a sample budget with realistic fake data (Note 2)."
    }
  ],
  "evidence": [
    {
      "text": "40% of new users leave at the bank-linking step.",
      "source": "Problem framing in context",
      "supports": 1
    },
    {
      "text": "61% of 212 survey respondents say they do not trust the app with their bank login.",
      "source": "Note 3",
      "supports": 2
    },
    {
      "text": "Meera suggested manual entry as a way to let users link banks later.",
      "source": "Note 1",
      "supports": 3
    },
    {
      "text": "Asha suggested using fake data to show the payoff before setup.",
      "source": "Note 2",
      "supports": 4
    }
  ],
  "objections": [
    {
      "text": "The team has not yet determined which direction aligns with technical capabilities.",
      "reason": "The AI asked a question about technical capabilities in the conversation, which remains unanswered."
    }
  ],
  "rejected_directions": [],
  "open_questions": [
    {
      "text": "Which of the proposed directions aligns best with current technical capabilities?"
    }
  ]
}
```

### glm5.3-flash

(json_schema)

```json
{
  "title": "Getting new users through their first week",
  "summary": "About 40% of new users leave at the bank-linking step. The team explored three ways to get more people through their first week: manual entry before linking, showing a sample budget with fake data, and fixing trust at the linking step itself. Survey replies from people who quit point to trust as the main blocker, but the team does not yet know what convinces people who do link.",
  "findings": [
    {
      "text": "Let people add a few expenses by hand first and link the bank later. This skips the bank login, so people reach value before being asked for credentials.",
      "reason": "It directly avoids the blocker in Dev's survey, where 61% of leavers said they do not trust a new app with their bank login yet."
    },
    {
      "text": "Show a sample budget with realistic fake data so people see the payoff before any setup.",
      "reason": "It may make the link feel worth it by showing what users get in the first minute. But fake data can feel dishonest and it does not solve the trust problem itself."
    },
    {
      "text": "Attack the trust problem directly at the linking step. Possible moves: explain what the app can and cannot see, name the security provider used, offer linking one account instead of all, or defer the ask until after a first session.",
      "reason": "None of the board notes address why people distrust the linking step, so this targets the stated blocker head on. It is still a draft direction with no evidence on which trust fix would work."
    }
  ],
  "evidence": [
    {
      "text": "Dev's note: exit survey with 212 replies, 61% say they do not trust a new app with their bank login yet.",
      "source": "Board note 3 from Dev",
      "supports": 3
    },
    {
      "text": "The same survey shows trust is the stated blocker at the linking step, which manual entry would avoid entirely.",
      "source": "Board note 3 from Dev",
      "supports": 1
    },
    {
      "text": "Meera's note proposes manual entry first and linking later.",
      "source": "Board note 1 from Meera",
      "supports": 1
    },
    {
      "text": "Asha's note proposes a sample budget with realistic fake data.",
      "source": "Board note 2 from Asha",
      "supports": 2
    }
  ],
  "objections": [
    {
      "text": "Manual entry is tedious, so people who skip the bank link may churn later at the same wall.",
      "reason": "Avoiding the blocker now does not remove it for people who eventually want automatic tracking."
    },
    {
      "text": "The 61% figure comes from people who already quit, so it may not reflect what would convince them to stay.",
      "reason": "It is their stated reason after leaving, not a tested measure of what would change their decision."
    }
  ],
  "rejected_directions": [],
  "open_questions": [
    {
      "text": "Do people who complete linking say what convinced them? This would show which direction has the best odds."
    }
  ]
}
```

### deepseekv4.1-flash-1017

(json_schema)

```json
{
  "title": "Getting new users past the bank-linking step",
  "summary": "About 40% of new users leave the budgeting app at the bank-linking step, before they see any value. The exploration produced three directions: let people log expenses by hand first, show a sample budget with realistic fake data, and tackle the trust objection head on. Dev's exit survey of 212 replies found 61% do not yet trust a new app with their bank login, which is the largest stated reason in the data. None of the directions has been tested, and the board has not established whether the 40% never intended to link or tried and failed.",
  "findings": [
    {
      "text": "The largest stated reason people give for leaving is not trusting a new app with their bank login.",
      "reason": "Dev's exit survey of 212 replies reports 61% saying they do not trust a new app with their bank login yet, which is the biggest single reason in the data the board holds."
    },
    {
      "text": "Two of the three directions let a new user see a working budget without linking a bank at all.",
      "reason": "Meera's note puts hand-entered expenses before the link, and Asha's note shows a sample budget with realistic fake data, so in both cases the link stops being a gate."
    },
    {
      "text": "The directions are not competing and could run together.",
      "reason": "They act on different moments in the first session: hand entry removes the blocked step, the sample budget sells the payoff, and the trust work addresses the stated objection. The exploration found no reason they conflict."
    }
  ],
  "evidence": [
    {
      "text": "Exit survey, 212 replies: 61% say they do not trust a new app with their bank login yet.",
      "source": "Dev",
      "supports": 1
    },
    {
      "text": "Let people add a few expenses by hand first, and link the bank later.",
      "source": "Meera",
      "supports": 2
    },
    {
      "text": "Show a sample budget with realistic fake data, so people see the payoff before any setup.",
      "source": "Asha",
      "supports": 2
    },
    {
      "text": "About 40% of new users leave at the bank-linking step, before they see any value.",
      "source": "Problem the team framed",
      "supports": 3
    }
  ],
  "objections": [
    {
      "text": "The 212 exit survey replies are self-selected and may not represent the 40% who leave.",
      "reason": "People who choose to answer an exit survey are not a random sample of everyone who dropped off, so 61% may overstate or understate trust as the real cause."
    },
    {
      "text": "\"Do not trust yet\" may mean \"not convinced this app is worth it\" rather than a security fear.",
      "reason": "If the survey answer is standing in for low perceived value, then a security explainer or read-only framing would not move the number, and Asha's sample budget direction would matter more."
    },
    {
      "text": "Hand entry may not bring people back to link later.",
      "reason": "If users stay manual, the drop-off at linking is avoided rather than solved, and the app may lose the data it needs to be useful."
    },
    {
      "text": "A sample budget may only move the drop-off to the next screen.",
      "reason": "The exploration did not establish that a demo builds trust, so people could still leave once a real login is requested."
    }
  ],
  "rejected_directions": [],
  "open_questions": [
    {
      "text": "Is the 40% drop mostly people who never intended to link, or people who tried and failed?"
    },
    {
      "text": "Do users who start with hand-entered expenses go on to link a bank later, or stay manual?"
    },
    {
      "text": "Does a sample budget actually build trust, or just delay the drop-off?"
    },
    {
      "text": "Which trust tactic would be tested first: read-only access framing, a security explainer, or a trusted third-party link?"
    },
    {
      "text": "How many of the 40% who leave are represented by the 212 survey replies?"
    }
  ]
}
```

## 5. Title

| Model | Latency | Tokens |
|---|---|---|
| gemma4 | 513 ms | 554 in, 12 out |
| glm5.3-flash | 430 ms | 526 in, 16 out |
| deepseekv4.1-flash-1017 | 488 ms | 596 in, 15 out |

### gemma4

(json_schema) Improving Budgeting App User Retention

### glm5.3-flash

(json_schema) Getting new users past the bank-linking step

### deepseekv4.1-flash-1017

(json_schema) Improving new user bank linking and first week
