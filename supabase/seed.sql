-- Local and CI only (BR-TRU-006, engineering-constitution.md §8). Never loaded into production.
-- A handful of suburbs so the profile step works before the ABS import (INT-006) exists.
-- Ids are placeholders, not ABS SAL codes; the import replaces this table.
insert into public.suburbs (id, name, state, postcode, lat, lng, timezone, is_city) values
  (90001, 'Perth', 'WA', '6000', -31.9523, 115.8613, 'Australia/Perth', true),
  (90002, 'Baldivis', 'WA', '6171', -32.3322, 115.8270, 'Australia/Perth', false),
  (90003, 'Rockingham', 'WA', '6168', -32.2810, 115.7300, 'Australia/Perth', false),
  (90004, 'Mandurah', 'WA', '6210', -32.5269, 115.7217, 'Australia/Perth', true),
  (90005, 'Karratha', 'WA', '6714', -20.7364, 116.8463, 'Australia/Perth', true),
  (90006, 'Kalgoorlie', 'WA', '6430', -30.7490, 121.4660, 'Australia/Perth', true),
  (90007, 'Port Hedland', 'WA', '6721', -20.3106, 118.6060, 'Australia/Perth', true),
  (90008, 'Joondalup', 'WA', '6027', -31.7448, 115.7661, 'Australia/Perth', false)
on conflict (id) do nothing;
