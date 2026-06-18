# Storyboard — "Hành trình của chiếc thuyền giấy" (~36s, 9 clip)

Phim ngắn demo cho đồ án. Style **painterly / watercolor atmospheric** (không realistic) —
hợp với bộ model: img gen **FLUX.1 Kontext (dev)** + video **LTX 13B (i2v)**.

## Flow

1 ảnh thuyền (txt2img) → 9 cảnh edit (thuyền làm input, Kontext bung scene quanh nó) → 9 i2v.
Tổng **19 prompt**. Không gen scene riêng.

## Cấu hình chung

- **txt2img / Kontext edit:** ~1024×576 (16:9). Fix seed chiếc thuyền ở mọi bước edit để giữ nhận diện.
- **LTX 13B i2v:** 832×480, ~97 frames (≈4s @ 24fps; frames = 8n+1), steps 25–30 (distilled: 8), guidance 3.0–3.5.
- **Negative (mọi txt2img + Kontext edit):**
  `sharp harsh outlines, photorealistic, hyperdetailed, text, watermark, deformed, extra paper boats, oversaturated, jpeg artifacts, blurry low quality`
- **Negative i2v cho riêng clip 1 & 9** (chặn lỗi "nhấc thuyền"):
  `the boat lifting up, the boat rising into the air, the boat leaving the water, the boat following the hand, boat moving upward, zoom in, hand grabbing the boat`

---

## 0. Prompt tạo thuyền (txt2img — chạy 1 lần)

```
a small white folded origami paper boat, simple clean precise paper folds, slightly worn matte paper texture, centered on a plain soft neutral gradient background, high three-quarter angle from slightly above, soft even lighting, soft painterly digital painting, watercolor texture, muted palette, clean, no text
```

> Chọn 1 con ưng, lưu seed. Góc "high three-quarter" hợp với hầu hết cảnh mặt nước. Cảnh nào lệch góc quá thì gen thêm 1 ảnh thuyền góc đó.

---

## Clip 1 — Thả thuyền (top-down, mưa)

**Kontext edit (input = ảnh thuyền):**
```
keep the white origami paper boat unchanged, preserve its exact folds and worn paper texture, place it resting on a rain puddle as if just released by a small child's hand entering from the side, top-down view; transform the background into a wet city street gutter with soft reflections and light rain ripples, early morning, soft painterly digital painting, watercolor texture, atmospheric, volumetric light, muted teal and amber palette, dreamy haze, Ghibli-inspired painted background, cinematic widescreen
```

**i2v:**
```
the child's hand has already let go and lifts upward out of the top of the frame, moving away; meanwhile the paper boat stays flat on the water surface and slowly slides forward across the puddle, gentle ripples spreading behind it, soft rain falling; the boat keeps floating on the water and drifts away, static top-down camera
```

---

## Clip 2 — Trôi phố đêm (neon)

**Kontext edit:**
```
keep the white origami paper boat unchanged, preserve its folds and worn paper texture, place it floating at the center of a narrow shallow water channel; transform the background into a neon-lit night street beside the channel, glowing pink and cyan reflections shimmering on the dark water, soft painterly digital painting, watercolor texture, atmospheric, volumetric light, muted teal and amber palette, dreamy haze, Ghibli-inspired painted background, cinematic widescreen
```

**i2v:**
```
the paper boat drifts forward steadily along the channel, neon reflections shimmer and ripple on the water, slow camera pan following the boat
```

---

## Clip 3 — Đường hầm tối

**Kontext edit:**
```
keep the white origami paper boat unchanged, preserve its folds and worn paper texture, place it drifting in the foreground; transform the background into the dark mouth of a concrete drainage tunnel half-filled with still water, a single faint warm glowing light at the far end, dripping water, mysterious quiet mood, soft painterly digital painting, watercolor texture, atmospheric, volumetric light, muted teal palette, dreamy haze, Ghibli-inspired painted background, cinematic widescreen
```

**i2v:**
```
the paper boat drifts slowly deeper into the tunnel toward the distant glowing light, water drips from the ceiling making small ripples, slow forward camera push, gradually darker
```

---

## Clip 4 — Sông lớn thành phố (wide)

**Kontext edit:**
```
keep the white origami paper boat unchanged, preserve its folds and worn paper texture, make it small and alone in the center; transform the background into a vast calm city river at night seen from a wide distance, distant twinkling lights along both banks reflecting on the dark rippling water, lonely expansive atmosphere, soft painterly digital painting, watercolor texture, atmospheric, volumetric light, muted teal and amber palette, dreamy haze, Ghibli-inspired painted background, cinematic widescreen
```

**i2v:**
```
the tiny paper boat glides very slowly across the calm river, distant city lights twinkle and reflect on the gently rippling water, very slow forward drift, static wide camera
```

> Nếu Kontext kéo thuyền to quá: thêm `tiny, far away, small in frame` hoặc giảm strength.

---

## Clip 5 — Bình minh đầm sen

**Kontext edit:**
```
keep the white origami paper boat unchanged, preserve its folds and worn paper texture, place it floating among lotus flowers; transform the background into a misty lotus pond at dawn with pink lotus and green lily pads on calm water, soft golden sunrise light, thin drifting fog, serene peaceful mood, soft painterly digital painting, watercolor texture, atmospheric, volumetric light, muted amber and green palette, dreamy haze, Ghibli-inspired painted background, cinematic widescreen
```

**i2v:**
```
morning mist drifts slowly across the pond, lotus leaves sway gently, the soft sunrise glow grows warmer, the paper boat floats slowly forward, static camera
```

---

## Clip 6 — Cửa biển, mặt trời mọc

**Kontext edit:**
```
keep the white origami paper boat unchanged, preserve its folds and worn paper texture, place it riding gentle swells at the center; transform the background into a river mouth opening to the vast sea at sunrise, gentle swelling waves, the sun rising on the horizon spreading golden light across the water, hopeful expansive mood, soft painterly digital painting, watercolor texture, atmospheric, volumetric light, muted amber and teal palette, dreamy haze, Ghibli-inspired painted background, cinematic widescreen
```

**i2v:**
```
the paper boat gently rocks on soft swelling waves, the sun rises slowly spreading golden light over the sea surface, calm gentle motion, slow camera
```

---

## Clip 7 — Giữa biển, ngấm nước (căng thẳng)

**Kontext edit** (chỗ duy nhất cho phép biến dạng thuyền):
```
take the white origami paper boat but make it look wet and darkened, the paper softened and slightly drooping, tilting on a wave, keep its recognizable folds; transform the background into the open sea under an overcast moody sky with larger rolling cold grey-blue waves, lonely tense atmosphere, soft painterly digital painting, watercolor texture, atmospheric, volumetric light, muted desaturated teal palette, dreamy haze, Ghibli-inspired painted background, cinematic widescreen
```

**i2v:**
```
the wet paper boat tilts and bobs unsteadily on rising waves, water laps over its softened edges, tense rocking motion, slightly unstable, slow camera
```

---

## Clip 8 — Chìm dần dưới nước (mờ ảo nhất)

**Kontext edit:**
```
take the white origami paper boat, make the wet paper softened and slightly unfolding as it sinks, keep it recognizable; transform the background into an underwater view in hazy blue-green depths with soft god rays piercing down from the surface above and scattered rising bubbles, melancholic dreamy quiet, soft painterly digital painting, watercolor texture, atmospheric, volumetric light, muted blue-green palette, dreamy haze, Ghibli-inspired painted background, cinematic widescreen
```

**i2v:**
```
the paper boat descends slowly into the depths, god rays shimmer through the water surface above, small bubbles rise gently, dreamlike slow sinking motion, slow downward camera
```

---

## Clip 9 — Vòng lặp (match-cut về Clip 1)

**Kontext edit:**
```
keep the white origami paper boat but make it brand new, clean and crisp with undamaged paper, preserve the same folds, place it already resting on still water with an adult hand beside it just having released it, top-down view; transform the background into a calm perfectly still water surface at dawn with soft warm morning light reflecting, fresh hopeful mood, soft painterly digital painting, watercolor texture, atmospheric, volumetric light, muted amber palette, dreamy haze, Ghibli-inspired painted background, cinematic widescreen
```

**i2v:**
```
the paper boat is already resting flat on the still water; the adult hand withdraws upward and out of frame to the side, separately, while the boat stays floating on the surface and begins to drift slowly forward, ripples spreading outward across the calm dawn water, static top-down camera
```

---

## Hậu kỳ & lưu ý

- **Match-cut bằng nước:** mọi clip mở/đóng trên mặt nước → cắt gần như liền mạch.
- **Lỗi "nhấc thuyền" (clip 1 & 9):** tách rõ hướng — tay đi LÊN-RA, thuyền trượt NGANG; giữ frame đầu có thuyền đã nằm trên nước; dùng negative i2v ở trên. Từ khóa vàng: `stays flat on the water surface`, `slides forward`, `drifts away`. Tránh đặt `lift/lower/release` cạnh chữ boat.
- **Đồng nhất:** giữ palette teal–amber xuyên suốt; phủ film grain + bloom nhẹ + letterbox 2.39 lên toàn bộ để 9 clip thành một phim, đồng thời che chênh lệch chất lượng giữa các clip.
- **Nhạc:** 1 track piano/ambient ~36s buộc cả phim thành câu chuyện.

## Arc cảm xúc

sinh ra (1) → phiêu lưu qua phố/hầm/sông (2–4) → khoảnh khắc đẹp (5–6) → gian nan (7) → tan biến (8) → tiếp nối (9).
