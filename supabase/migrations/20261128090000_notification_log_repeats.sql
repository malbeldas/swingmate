-- Retroactive risk review of the emails (11/11), notifications.md rule 7, BR-MAIL-001.
-- notification_log_once allowed one 'sent' row per (template, ref_id, user_id) for every template.
-- That is right for emails that go once per thing, but three go again about the same thing:
--   * NTF-003, new messages: once an hour at most per conversation and person;
--   * NTF-006, calendar check: every 30 days per listing while the host doesn't confirm;
--   * NTF-007, alert digest: once a day per person (ref_id is the first alert of the digest).
-- From the second email on, the log insert failed in silence, and the checks that read the last
-- 'sent' row (60 minutes, 30 days, failures since the last one) saw the first email forever: NTF-003
-- could go every 5 minutes and NTF-006 every day. Those three now keep a row per send; the rest
-- keep the unique index, so NTF-004, NTF-005 and NTF-009 still can't be logged twice.

drop index public.notification_log_once;

create unique index notification_log_once on public.notification_log (template, ref_id, user_id)
  where status = 'sent' and template not in ('NTF-003', 'NTF-006', 'NTF-007');

create index notification_log_repeat_idx on public.notification_log (template, ref_id, user_id, created_at)
  where status = 'sent' and template in ('NTF-003', 'NTF-006', 'NTF-007');
