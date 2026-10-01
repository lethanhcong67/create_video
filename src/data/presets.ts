import { CameraMovementPreset } from '../types';

export const CAMERA_PRESETS: CameraMovementPreset[] = [
  {
    id: 'static',
    title: 'Static (Cố định)',
    subtitle: 'Camera giữ nguyên vị trí, góc máy ổn định sắc nét',
    iconName: 'Camera',
    badge: 'Tĩnh',
    prompt: 'Static fixed camera angle, crystal sharp focus, stable composition with subtle micro-movements.',
    description: 'Giữ camera cố định, phù hợp video phong cách giới thiệu sản phẩm'
  },
  {
    id: 'zoom_in',
    title: 'Zoom In (Dolly In)',
    subtitle: 'Phóng to từ từ vào nhân vật & chi tiết chủ thể',
    iconName: 'ZoomIn',
    badge: 'Cận cảnh',
    prompt: 'Smooth slow cinematic zoom-in dolly camera moving towards the subject, focusing on facial expressions and fine details, 4k resolution.',
    description: 'Lướt camera tiến gần, nhấn mạnh biểu cảm và chi tiết'
  },
  {
    id: 'zoom_out',
    title: 'Zoom Out (Dolly Out)',
    subtitle: 'Lùi dần từ cận cảnh ra toàn cảnh bối cảnh',
    iconName: 'ZoomOut',
    badge: 'Toàn cảnh',
    prompt: 'Smooth slow cinematic zoom-out dolly shot pulling back gracefully to reveal the full scene and ambient environment.',
    description: 'Lùi camera từ từ để mở rộng tầm nhìn bối cảnh'
  },
  {
    id: 'tilt_up',
    title: 'Tilt Up (Từ dưới lên)',
    subtitle: 'Lia máy dọc từ dưới lên góc nhìn cao',
    iconName: 'ArrowUp',
    badge: 'Lookbook',
    prompt: 'Cinematic vertical tilt-up camera movement starting from the lower subject up to eye level, ultra smooth motion.',
    description: 'Góc máy quét từ dưới lên tôn vinh chủ thể'
  },
  {
    id: 'tilt_down',
    title: 'Tilt Down (Từ trên xuống)',
    subtitle: 'Lia máy dọc từ trên đỉnh đầu xuống dưới',
    iconName: 'ArrowDown',
    badge: 'Toàn thân',
    prompt: 'Cinematic vertical tilt-down camera movement starting from above gracefully down, high quality studio look.',
    description: 'Quét từ trên xuống các chi tiết'
  },
  {
    id: 'pan_right',
    title: 'Pan Phải (Lướt sang phải)',
    subtitle: 'Camera lướt ngang mượt mà sang phải',
    iconName: 'ArrowRight',
    badge: 'Lướt ngang',
    prompt: 'Smooth horizontal camera pan moving slowly from left to right, capturing side profile and scenic depth.',
    description: 'Lia ngang sang phải tạo cảm giác không gian rộng mở'
  },
  {
    id: 'pan_left',
    title: 'Pan Trái (Lướt sang trái)',
    subtitle: 'Camera lướt ngang mượt mà sang trái',
    iconName: 'ArrowLeft',
    badge: 'Lướt ngang',
    prompt: 'Smooth horizontal camera pan moving slowly from right to left, revealing the subject with cinematic elegance.',
    description: 'Lia ngang sang trái mượt mà'
  },
  {
    id: 'orbit',
    title: 'Orbit (Xoay 360 vòng quanh)',
    subtitle: 'Quay vòng cung quanh chủ thể',
    iconName: 'RotateCw',
    badge: '360 Độ',
    prompt: 'Cinematic smooth orbiting arc camera shot rotating gracefully around the subject, showcasing 3D depth.',
    description: 'Góc máy điện ảnh xoay vòng cung tôn chiều sâu 3D'
  },
  {
    id: 'runway',
    title: 'Runway (Sàn diễn / Tracking)',
    subtitle: 'Chuyển động tracking bước đi bám sát chủ thể',
    iconName: 'Sparkles',
    badge: 'Dynamic',
    prompt: 'Dynamic cinematic tracking camera following the subject with smooth movement, professional studio lighting.',
    description: 'Nhịp điệu sống động, chuyên nghiệp'
  },
  {
    id: 'handheld',
    title: 'Handheld (Vlog / Cầm tay)',
    subtitle: 'Rung nhẹ tự nhiên kiểu quay điện thoại/vlog',
    iconName: 'Video',
    badge: 'Tự nhiên',
    prompt: 'Natural subtle handheld camera motion with gentle organic breathing movement, authentic lifestyle vlog aesthetic.',
    description: 'Hiệu ứng cầm tay chân thực cho video TikTok/Reels/Shorts'
  }
];

export const CAMERA_MOVEMENT_PRESETS = CAMERA_PRESETS;

export const VIDEO_PROMPT_IDEAS = [
  {
    title: 'Cyberpunk Neon City Walking',
    prompt: 'A futuristic samurai walking through rain-slicked Tokyo streets filled with glowing holographic neon signs, cinematic volumetric lighting, 8k quality.',
    type: 'text_to_video'
  },
  {
    title: 'Nature Cinematic Sunrise Drone',
    prompt: 'Breathtaking 4K drone shot over mist-covered pine mountain peaks during a vibrant golden sunset, dramatic clouds and lens flare.',
    type: 'text_to_video'
  },
  {
    title: 'High Fashion Model Runway Walk',
    prompt: 'High fashion model walking down a glossy reflective runway, wearing an iridescent glowing silk gown, soft studio spotlights, slow motion 60fps.',
    type: 'text_to_video'
  },
  {
    title: 'Anime Shonen Magic Battle',
    prompt: 'Dynamic cinematic anime scene of a hero summoning glowing blue energy flame aura, vibrant colors, Makoto Shinkai aesthetic.',
    type: 'text_to_video'
  }
];
