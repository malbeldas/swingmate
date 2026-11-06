// Safety (#20): "Before you agree" is the same guide the listing and the conversation show
// (BR-TRU-008), drawn from core/trust.js so the three never differ.
import { beforeYouAgree } from '../ui/before-you-agree.js';

document.getElementById('before-you-agree-slot')?.replaceChildren(beforeYouAgree({ open: true }));
