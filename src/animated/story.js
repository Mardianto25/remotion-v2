// Preview storyboard: explicit character actions and camera language per scene.
// Production Facebook Reels replaces this with Gemini-generated scene direction.
export const defaultAnimatedSegments = [
  {
    start: 0, end: 7,
    text: 'Kadang kita merasa doa kita belum dijawab.',
    setting: 'street', action: 'walking', mood: 'sad', camera: 'wide'
  },
  {
    start: 7, end: 15,
    text: 'Padahal, mungkin Allah sedang menyiapkan sesuatu yang lebih baik.',
    setting: 'home', action: 'sitting', mood: 'reflective', camera: 'medium'
  },
  {
    start: 15, end: 24,
    text: 'Tidak semua yang tertunda berarti ditolak.',
    setting: 'courtyard', action: 'looking_up', mood: 'hopeful', camera: 'close'
  },
  {
    start: 24, end: 34,
    text: 'Ada waktu yang tepat untuk setiap ketetapan-Nya.',
    setting: 'garden', action: 'dua', mood: 'peaceful', camera: 'orbit'
  },
  {
    start: 34, end: 54,
    text: 'Tugas kita adalah terus berusaha, berdoa, dan menjaga harapan. Sebab pertolongan Allah bisa datang dari arah yang tidak kita sangka.',
    setting: 'garden', action: 'standing', mood: 'hopeful', camera: 'wide'
  }
];
