# SwingMate — Full product design direction

**Issue:** #103  
**Dirección seleccionada:** Marketplace editorial  
**Estado:** lista para llevar a Figma y validar antes de codear

## 1. Objetivo

Diseñar SwingMate como un producto completo y coherente de punta a punta, manteniendo las reglas funcionales ya implementadas y elevando jerarquía, confianza, claridad y carácter visual.

La dirección combina:

- estructura de marketplace de alojamiento;
- fotografía con peso real;
- disponibilidad y roster como diferenciador funcional;
- interfaces utilitarias donde corresponde;
- pocas superficies, pocas sombras y menos “card UI”;
- microcopy breve;
- continuidad visual entre discovery, contacto, cuenta y host.

No se busca rediseñar la marca ni convertir SwingMate en una SaaS genérica.

---

## 2. Principio visual maestro

**The home attracts. The calendar validates. The conversation converts.**

Cada parte del producto debe cumplir una tarea dominante:

- Home: entender y empezar.
- Search: comparar.
- Listing: validar.
- Contact: convertir intención en conversación.
- Messages: generar confianza.
- Account: controlar.
- Host: publicar y mantener disponibilidad.
- Admin: operar y moderar.

---

## 3. Arquitectura propuesta para Figma Free

Un solo archivo: **SwingMate — Product Design v1**

### Página 1 — 00 Foundations & Components

Contiene:

- logo aprobado;
- tokens actuales;
- tipografía;
- spacing;
- grids desktop/mobile;
- buttons;
- fields;
- chips;
- fit labels;
- trust badges;
- listing card;
- 4-week availability strip;
- monthly/expanded calendar;
- roster preview;
- sheets/modals;
- message bubbles;
- alert/empty/error states;
- host card;
- navigation;
- tabs;
- account sidebar;
- admin table patterns.

Todos los componentes son locales al mismo archivo.

### Página 2 — 01 Product Flows

Mapas simples y clicables de:

1. Visitor search flow.
2. Roster setup.
3. Listing → contact → auth → profile → send.
4. Returning user contact.
5. Save listing.
6. Create alert.
7. Account / seeker management.
8. Host publish flow.
9. Host manage listing/calendar.
10. Inbox/conversation.
11. Report/block.
12. Admin moderation.

### Página 3 — 02 Screens & Prototype

Todas las pantallas desktop y mobile, agrupadas por sección.

---

## 4. Shell global

### Desktop

Header con:

- logo;
- Find a stay;
- How it works;
- List a place;
- account state: Log in / Sign up o avatar/menu.

No llenar el header con enlaces secundarios.

### Mobile

- logo;
- menú;
- búsqueda/contexto persistente cuando corresponda;
- CTAs sticky solo en tareas de conversión.

### Footer

Breve:

- How it works;
- Safety;
- Terms;
- Privacy;
- Instagram.

---

## 5. Public discovery

### P01 — Home

Objetivo: entender SwingMate y comenzar una búsqueda.

Above the fold:

- headline corto;
- una imagen de ambiente/alojamiento o composición editorial;
- search bar: Location / Dates / Roster;
- CTA Search homes.

Debajo:

- una demostración simple de “your nights vs available nights”;
- homes reales si existen;
- How it works en formato editorial, no tres cards idénticas;
- bloque corto para hosts;
- trust/safety;
- FAQ.

No usar una foto stock de FIFO como solución permanente de hero.

### P02 — Roster sheet

- pattern;
- anchor date;
- flight questions;
- 4-week preview;
- Save / No fixed roster.

Desktop: modal/sheet.
Mobile: bottom/full-height sheet.

### P03 — Search results

Desktop:

- search context horizontal arriba;
- filtros en rail izquierdo;
- listado central;
- opcionalmente sort arriba;
- sin panel de detalle permanente.

Cards:

- foto grande;
- título;
- suburbio;
- price;
- 2–3 facts máximo;
- fit compacto;
- 4-week availability strip con fechas visibles;
- save action.

Near matches aparecen en sección separada.

Mobile:

- search context compacto;
- Filters / Sort como sheets;
- una card por fila;
- 4 semanas legibles sin scroll horizontal.

### P04 — Search empty state

- explicación seca;
- Clear filters;
- widen radius;
- Create alert;
- nunca inventario falso.

---

## 6. Listing detail

### P05 — Active listing

Desktop:

Main column:
- galería asimétrica: 1 dominante + 2 secundarias;
- title/suburb/price;
- fit explanation;
- expanded availability calendar;
- facts;
- description;
- amenities;
- approximate location;
- safety / Before you agree.

Right sticky rail:
- contact form;
- requested dates;
- message;
- Send;
- compact host identity/trust.

Host and contact remain contextually together.

Mobile:

- swipeable gallery;
- title/price;
- fit;
- availability;
- primary facts;
- sticky Send message;
- host;
- remaining detail.

### P06 — Paused/Filled listing

- status clearly visible;
- no contact form;
- search alternatives CTA.

### P07 — Removed/Unavailable listing

- simple state;
- Back to search;
- related search only if real inventory exists.

---

## 7. Contact & authentication

### P08 — Logged-in contact happy path

Contact form already visible on listing.

- dates optional/prefilled;
- message required;
- Send;
- sent confirmation in context;
- Open conversation.

No forced redirect.

### P09 — Logged-out auth gate

Triggered only after Send.

Desktop:
- contextual side sheet.

Mobile:
- full-height sheet.

Step 1:
- Continue with Google;
- Continue with email;
- Log in.

The listing remains conceptually behind the sheet.

### P10 — Email signup

- email;
- password;
- Continue.

### P11 — Verify email

- 6-digit code;
- resend;
- change email.

### P12 — Minimum profile

Required fields only:

- display name;
- suburb base;
- intent: Find / List / Both;
- Terms/Privacy acceptance.

Photo, bio, phone and roster are optional trust signals unless a rule specifically requires phone.

### P13 — Save visitor roster

If applicable:
- compact preview;
- Save roster;
- Not now.

### P14 — Draft restored

Return to listing with:

- dates preserved;
- message preserved;
- final Send.

### P15 — Phone verification gate

Only when required:

- AU phone;
- code;
- verify;
- preserve draft throughout.

---

## 8. Messages

### P16 — Inbox

Desktop:
- conversation list;
- selected conversation.

Mobile:
- list → thread.

Row:
- listing image;
- other person;
- listing context;
- last message;
- timestamp;
- unread.

### P17 — Conversation seeker view

- listing context header;
- requested dates;
- messages;
- Before you agree;
- risk warning if applicable;
- report/block;
- composer.

### P18 — Conversation host view

Adds:
- About {name};
- base suburb;
- roster;
- trust signals;
- requested dates compared with current availability.

Never email/phone of other person.

### P19 — Outcome question

Inline card in conversation:

- Yes, here;
- Yes, somewhere else;
- Not yet.

---

## 9. Account

Desktop uses a restrained sidebar; mobile uses account section list.

### P20 — Profile

- avatar;
- display name;
- base suburb;
- seeking/hosting capability;
- bio;
- job type where applicable;
- verification states.

### P21 — My roster

- 12-week roster view;
- Edit roster.

### P22 — Saved homes

Listing cards simplified.
Paused/filled state remains visible.

### P23 — Alerts

- search summary;
- active/paused;
- expiry;
- renew/delete.

### P24 — Notifications

Simple toggles:
- new messages;
- alerts;
- reminders.

### P25 — Privacy & data

- download data;
- delete account;
- concise warnings/confirmation.

---

## 10. Host publishing

### P26 — Host landing/entry

If user chooses List a place:
- short framing;
- Continue;
- resume draft if one exists.

### P27–P31 — 5-step listing wizard

Persistent progress:
**Step N of 5**

#### Step 1 — Place
- suburb;
- exact address private;
- type;
- bathroom.

#### Step 2 — Basics
- weekly price;
- bills;
- bond;
- minimum stay;
- furnished;
- household;
- features.

#### Step 3 — Story & photos
- title;
- description;
- minimum 3 photos;
- rules;
- FIFO extras.

Photos become the main surface; not a tiny uploader widget.

#### Step 4 — Availability
Most important host step.

- availability rule;
- optional roster;
- 12-week preview;
- open/block exceptions.

This screen should feel like a planning tool, not a marketing form.

#### Step 5 — Trust & publish
- phone verification state;
- truth declaration;
- preview CTA;
- Publish.

### P32 — Listing preview

Actual seeker-facing representation, with exact address removed.

### P33 — Published success

- View listing;
- Manage calendar;
- Share.

---

## 11. Host management

### P34 — My listings

Each listing:
- image;
- status;
- calendar freshness;
- Edit;
- Calendar;
- Pause / Mark filled / Reactivate.

### P35 — Manage calendar

- 12-week or month-based control;
- open/block nights;
- change availability rule;
- My calendar is up to date.

Utility-first visual language.

### P36 — Who can message me

Profile setting:
- Everyone;
- Verified phone only.

Clear explanation of consequence.

---

## 12. Report & safety

### P37 — Report sheet

- reason;
- details;
- Submit.

### P38 — Block confirmation

Minimal confirmation.

### P39 — Safety page

Editorial informational layout.
No fake “trust score”.

---

## 13. Admin

Admin is intentionally utilitarian and visually distinct from the consumer marketplace, while reusing tokens.

### P40 — Reports queue

- age;
- target;
- reason;
- status.

### P41 — Report detail

- reported object;
- grouped reports;
- moderation history;
- action;
- mandatory note.

Conversation content only when rules allow.

### P42 — Admin search

- search users/listings;
- state;
- reports;
- moderation log.

Do not style admin like a consumer dashboard with decorative cards.

---

## 14. Public informational pages

### P43 — How it works

Two paths:
- Find a place;
- List a place.

### P44 — Safety

Practical guidance.

### P45 — Terms

Legal content when approved.

### P46 — Privacy

Legal content when approved.

These pages share shell but use editorial document layouts, not marketing landing layouts.

---

## 15. System states that must be designed

Every major flow needs:

- loading;
- empty;
- error;
- disabled;
- offline/retry;
- paused;
- unavailable;
- success;
- destructive confirmation.

Especially:

- search failure;
- photo failure;
- message retry;
- auth error;
- code resend;
- listing gone during signup;
- calendar stale;
- upload error.

---

## 16. Responsive system

Primary targets:

- 375 × 740;
- 1280 × 800.

Desktop is not the source layout simply collapsed into mobile.

Mobile rules:

- filters become sheets;
- sticky CTAs only where task-critical;
- calendars remain readable;
- horizontal scrolling avoided for cards;
- galleries become swipeable;
- account/admin navigation becomes section-based.

---

## 17. Design language

### Keep

- navy / cream / amber foundation;
- teal for available / positive fit;
- Manrope + Inter;
- current logo;
- 4 px spacing system.

### Evolve

- reduce number of bordered cards;
- reserve shadows for elevated interaction/surfaces;
- use stronger type hierarchy;
- introduce more open layouts;
- reduce pills;
- use dividers and space;
- make calendar intentionally utilitarian.

### Avoid

Everything in `anti-patterns.md`.

---

## 18. Figma component strategy

Local components in the same file:

- Header;
- Footer;
- Button;
- Field;
- Select;
- Sheet;
- Listing card;
- Fit badge;
- Availability week;
- Availability month;
- Roster strip;
- Gallery;
- Host identity;
- Message composer;
- Message bubble;
- Conversation row;
- Account nav;
- Listing wizard step;
- Admin table row;
- Empty state;
- Error state;
- Toast/confirmation.

Variants are used only for actual product states, not every cosmetic difference.

---

## 19. Prototype paths

The Figma prototype must include at minimum:

### Flow A — Visitor → conversation
Home → Search → Listing → type message → Send → Sign up → Profile → Draft restored → Send → Conversation.

### Flow B — Returning seeker
Home/Search → Listing → Send → Conversation.

### Flow C — Host
List a place → auth/profile if needed → 5-step wizard → Preview → Publish → Manage calendar.

### Flow D — Account
Account → roster → saved → alerts → notifications/privacy.

### Flow E — Admin
Reports → detail → moderation action.

---

## 20. Human checkpoints

### Checkpoint 1 — Foundations + wireframes
Approve:
- IA;
- screen inventory;
- hierarchy;
- mobile model.

### Checkpoint 2 — Key screens
Approve:
- Home;
- Search;
- Listing;
- Contact/Auth;
- Host availability;
- Conversation.

### Checkpoint 3 — Full product consistency
Review remaining account/admin/info screens.

### Checkpoint 4 — Prototype
Approve interaction and handoff before implementation.

---

## 21. Definition of done for design

The complete design direction is ready when:

- all product screens above exist in desktop/mobile as applicable;
- core components are reusable;
- states are covered;
- prototype paths work;
- no screen violates BR/AC already defined;
- visual reviewer returns no blocking/high-severity generic-design findings;
- human approval is explicit;
- only then is a coding issue/PR opened for visual integration.
