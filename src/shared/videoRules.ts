// Single source of truth for the English video-generation rule phrases reused across the
// client's Kling payload builder (AutoProductVideoWorkflow.tsx) and the server's Kling AI
// request defaults (server.ts /api/kling/create-video). Previously this wording was hand
// re-typed in multiple places, so a tweak (e.g. the anti-180-flip clause or the tilt-angle
// bound) had to be made in every copy. Imported by both the browser bundle (Vite) and the
// Node server (tsx/esbuild), so it must stay free of DOM/Node-specific APIs.

export const VIDEO_NEGATIVE_PROMPT_BASE =
  'sluggish, slow motion, slow-mo, slowmo, bullet time, paused motion, frozen frame, snail pace, low energy, boring static shot, dull pacing, lazy movement, lifeless expressions, 180 degree flip, flipping backwards, flipping to backside, spinning to back, showing blank back, turning around 180 degrees, backward flip, reverse flip, rotated to rear view, phantom hands, phantom fingers appearing out of nowhere, deformed fingers, extra fingers, mutated hands, robotic unnatural movement, camera shake, camera panning, camera tilting, camera drift, camera rotating, timelapse, glare, lens flare, harsh reflections, blinding light, blown out highlights, overexposure, hot spots, smoke, steam, fog, haze, mist, vapor, fumes, self-rotating object, autonomous object spinning, floating in air, levitation, deformed product, rubbery product, bending product, soft melting object, morphing graphics, dissolving text, warped print, stretching artwork, fading logo, morphing, warping, blurry details, distorted logo, distorted text, low quality';

// Detects whether a scene involves a person/hands (vs. a standalone product shot), used to
// pick which reinforcement suffix below to append to the AI-generated videoPrompt.
export function isCharacterOrHandScene(text: string): boolean {
  return /hand|hold|touch|finger|person|woman|man|model|unboxing|wearing|putting|cầm|tay|người|vuốt|chạm/i.test(text);
}

// Bare reinforcement clauses (no base prompt prepended) — exported separately so other prompts
// that only need to QUOTE the canonical wording (e.g. the server's QC-gate refine instructions,
// which tell an evaluator LLM what phrase to use rather than concatenating it in code) can reuse
// the exact same text instead of hand re-typing a close paraphrase.
export const CHARACTER_SCENE_VIDEO_SUFFIX =
  'lively energetic natural human hands swiftly and deftly interacting with product at authentic 1.0x real-time speed, crisp agile finger movements, radiant warm smile, captivating viral TikTok UGC pacing, dynamic snappy motion throughout full 5s take, subtle tilt max 15-30 degrees catching glossy light glints, strictly no 180-degree flip to backside, front printed artwork and typography continuously face the camera clearly visible at all times, static fixed camera locked on tripod with zero camera drift, strictly no slow motion, no sluggish delay, rigid solid object geometry with zero bending zero warping zero deformation, custom printed artwork and typography remain 100% stable crisp legible and permanently fixed on product surface, natural physics and gravity, single continuous uncut take, no smoke, no glare, 4k ultra realistic';

export const STANDALONE_SCENE_VIDEO_SUFFIX =
  'standalone rigid solid product firmly resting in place with zero phantom hands, dynamic punchy cinematic push-in zoom-in with rapid visual impact focusing tightly onto the crisp front printed artwork and fine craftsmanship, front graphic and typography always directly facing camera with strictly no 180-degree flip, glossy dynamic ambient light reflection streak gliding swiftly across surface, high visual retention, snappy lively momentum, strictly no slow motion, zero sluggish delay, 1.0x energetic real-time playback speed, rigid indestructible geometry, single uncut take, no smoke, no glare, 4k photorealistic';

export function buildCharacterSceneVideoPrompt(basePrompt: string): string {
  return `${basePrompt}, ${CHARACTER_SCENE_VIDEO_SUFFIX}`;
}

export function buildStandaloneSceneVideoPrompt(basePrompt: string): string {
  return `${basePrompt}, ${STANDALONE_SCENE_VIDEO_SUFFIX}`;
}
