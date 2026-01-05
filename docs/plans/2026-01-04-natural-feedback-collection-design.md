# Natural Feedback Collection Design

## Overview

A system for encouraging user reviews and feedback in a natural, non-intrusive way. Feedback is triggered by positive interactions across multiple channels, prompting users only once per channel and stopping entirely once they've submitted feedback.

## Goals

1. Capture testimonials from happy users at the moment they're most positive
2. Collect constructive feedback from users who aren't fully satisfied
3. Feel natural and welcome, not aggressive or pestering
4. Maximize response rate without annoying users

## Triggers

Four channels, each prompts once per user (stops all prompts once feedback submitted):

### 1. GitHub PR Comment (Primary)

When a user replies to Buoy's PR comment with positive sentiment, post a follow-up asking for feedback.

**Keyword detection (case-insensitive, partial match):**
- `thanks`, `thank you`, `thx`
- `awesome`, `helpful`, `love this`
- `great`, `nice`, `perfect`
- `exactly what I needed`

**Response posted:**
> Glad Buoy's helping! If you have 30 seconds, we'd love your feedback → [buoy.design/feedback](link)

### 2. First Clean CI Run

When `buoy ci` exits successfully after previously catching drift (user experienced the full value loop).

**CLI output appended:**
```
✓ No drift detected

  Buoy helped catch drift before it shipped.
  Got 30 seconds? We'd love your feedback → https://buoy.design/feedback
```

### 3. Post-Onboarding Email (Day 7)

Automated email sent 7 days after first `buoy init` if user is logged in and has email.

**Email:**
> Subject: How's Buoy working for you?
>
> You've been using Buoy for a week now. We'd love to know what's working and what could be better.
>
> [Share your feedback](link) (takes 30 seconds)

### 4. After `buoy explain` Helps

Same keyword detection as PR comments, applied to `buoy explain` AI conversation responses.

**Response:**
> Glad that helped! Got 30 seconds to share feedback? → [buoy.design/feedback](link)

## Prompt Logic

```
canPrompt(user, channel) =
  NOT EXISTS(user_feedback_responses for user)
  AND NOT EXISTS(user_feedback_prompts for user + channel)
```

- User can be prompted once on each of the 4 channels (max 4 touches)
- Once feedback is submitted via any channel, all prompts stop permanently

## Data Model

### Table: `user_feedback_prompts`

| Column | Type | Description |
|--------|------|-------------|
| `user_id` | FK | Reference to user |
| `channel` | enum | `github_pr`, `cli_ci`, `email_onboarding`, `explain` |
| `prompted_at` | timestamp | When we showed the prompt |
| `unique(user_id, channel)` | constraint | Ensures once-per-channel |

### Table: `user_feedback_responses`

| Column | Type | Description |
|--------|------|-------------|
| `user_id` | FK | Reference to user |
| `rating` | enum | `great`, `good`, `okay`, `not_great` |
| `testimonial_text` | text | "What problem does Buoy solve?" |
| `constructive_text` | text | "What's getting in the way?" |
| `improvement_text` | text | "What would make Buoy more useful?" |
| `testimonial_permitted` | boolean | Can we quote them? |
| `contact_email` | text | Optional follow-up email |
| `source_channel` | enum | Which channel led to this response |
| `created_at` | timestamp | When submitted |

## Feedback Form (`buoy.design/feedback`)

### URL Structure

`buoy.design/feedback?channel=github_pr&user=xxx`

Query params enable tracking which channel drove the response.

### Form Flow

**Step 1: Rating (required)**
- "How's Buoy working for you?"
- Four buttons: 😍 Great / 🙂 Good / 😐 Okay / 😕 Not great

**Step 2: Conditional questions**

*If rating is 😍 Great or 🙂 Good:*
- "What problem does Buoy solve for you?" (textarea)
- ☐ "You can quote me (we'll reach out to confirm exact wording)"

*If rating is 😐 Okay or 😕 Not great:*
- "What's getting in the way?" (textarea)

**Step 3: Always shown (optional)**
- "What would make Buoy more useful for your team?" (textarea)
- "Email if you'd like us to follow up" (input)

**Step 4: Submit**
- Thank you message
- Close tab or redirect to buoy.design

### Form Design Notes

- Single page, no multi-step wizard (reduces drop-off)
- All text fields optional except rating
- Auto-save on blur (in case they abandon)
- Mobile-friendly (PR comment links often opened on phone)

## Question Design Rationale

| Question | Purpose | Why it works |
|----------|---------|--------------|
| "What problem does Buoy solve for you?" | Testimonial extraction | Prompts outcome-focused language ("catches drift before it ships") |
| "What's getting in the way?" | Constructive feedback | Direct, non-defensive framing invites honest criticism |
| "What would make Buoy more useful?" | Feature discovery | Works for both happy (feature requests) and frustrated (pain points) users |
| Testimonial permission checkbox | Legal consent | "We'll reach out to confirm" reassures they'll approve final wording |

## Implementation Phases

### Phase 1: Foundation
- Create database tables
- Build feedback form page
- Implement `canPrompt()` logic

### Phase 2: GitHub PR Trigger
- Add keyword detection to PR comment handler
- Post follow-up comment when triggered
- Record prompt in database

### Phase 3: CLI Trigger
- Track `has_seen_drift` flag per user
- Detect clean run after previous drift
- Append feedback prompt to CLI output

### Phase 4: Email Trigger
- Record `buoy init` timestamp
- Background job for day-7 emails
- Email template and sending

### Phase 5: Explain Trigger
- Add keyword detection to explain command
- Display feedback prompt in conversation

## Success Metrics

- **Response rate**: % of prompts that result in feedback submission
- **Testimonial rate**: % of responses with testimonial permission granted
- **Channel effectiveness**: Which channels drive most/best responses
- **Sentiment distribution**: Rating breakdown over time
