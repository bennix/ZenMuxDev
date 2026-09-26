/** ZenMux 图片与视频目录，比例和时长来自 2026-09-26 的模型 api_info。 */

export interface ImageCatalogEntry {
  id: string;
  name: string;
  protocol: "gemini" | "vertex";
  reference: "none" | "optional" | "required";
  ratioKind: "aspect" | "size";
  ratios: readonly string[];
}

export interface VideoCatalogEntry {
  id: string;
  name: string;
  ratios: readonly string[];
  durations: readonly number[];
}

export const IMAGE_CATALOG: readonly ImageCatalogEntry[] = [
  {
    "id": "google/gemini-2.5-flash-image",
    "name": "Gemini 2.5 Flash Image (Nano Banana)",
    "protocol": "gemini",
    "reference": "optional",
    "ratioKind": "aspect",
    "ratios": [
      "1:1",
      "16:9",
      "9:16",
      "4:3",
      "3:4"
    ]
  },
  {
    "id": "klingai/kling-v2",
    "name": "Kling-v2",
    "protocol": "vertex",
    "reference": "optional",
    "ratioKind": "aspect",
    "ratios": [
      "1:1",
      "16:9",
      "9:16",
      "4:3",
      "3:4"
    ]
  },
  {
    "id": "z-ai/glm-image",
    "name": "GLM-Image",
    "protocol": "vertex",
    "reference": "none",
    "ratioKind": "size",
    "ratios": [
      "1024x1024",
      "2048x2048",
      "1280x1280"
    ]
  },
  {
    "id": "bfl/flux-2-flex",
    "name": "FLUX.2 Flex",
    "protocol": "vertex",
    "reference": "optional",
    "ratioKind": "aspect",
    "ratios": [
      "1:1",
      "2:3",
      "3:2",
      "4:3",
      "3:4",
      "9:16",
      "16:9",
      "21:9"
    ]
  },
  {
    "id": "bfl/flux-2-max",
    "name": "FLUX.2 Max",
    "protocol": "vertex",
    "reference": "optional",
    "ratioKind": "aspect",
    "ratios": [
      "1:1",
      "2:3",
      "3:2",
      "4:3",
      "3:4",
      "9:16",
      "16:9",
      "21:9"
    ]
  },
  {
    "id": "bfl/flux-2-pro",
    "name": "FLUX.2 Pro",
    "protocol": "vertex",
    "reference": "optional",
    "ratioKind": "aspect",
    "ratios": [
      "1:1",
      "2:3",
      "3:2",
      "4:3",
      "3:4",
      "9:16",
      "16:9",
      "21:9"
    ]
  },
  {
    "id": "qwen/qwen-image-2.0-pro",
    "name": "Qwen-Image-2.0-Pro",
    "protocol": "vertex",
    "reference": "optional",
    "ratioKind": "size",
    "ratios": [
      "1024x1024",
      "1024x1536",
      "1536x1024",
      "1152x2048",
      "2048x1152",
      "1536x2048",
      "2048x1536",
      "2048x2048"
    ]
  },
  {
    "id": "qwen/qwen-image-2.0",
    "name": "Qwen-Image-2.0",
    "protocol": "vertex",
    "reference": "optional",
    "ratioKind": "size",
    "ratios": [
      "1024x1024",
      "1024x1536",
      "1536x1024",
      "1152x2048",
      "2048x1152",
      "1536x2048",
      "2048x1536",
      "2048x2048"
    ]
  },
  {
    "id": "bytedance/doubao-seedream-5.0-lite",
    "name": "Doubao-Seedream-5.0-lite",
    "protocol": "vertex",
    "reference": "optional",
    "ratioKind": "aspect",
    "ratios": [
      "1:1",
      "16:9",
      "9:16",
      "4:3",
      "3:4"
    ]
  },
  {
    "id": "openai/gpt-image-2",
    "name": "GPT-Image-2",
    "protocol": "vertex",
    "reference": "optional",
    "ratioKind": "size",
    "ratios": [
      "auto",
      "1024x1024",
      "1536x1024",
      "1024x1536",
      "2048x2048",
      "2048x1152",
      "3840x2160",
      "2160x3840",
      "1536x2048",
      "2048x1536"
    ]
  },
  {
    "id": "tencent/hy-image-v3.0",
    "name": "HY-Image-V3.0",
    "protocol": "vertex",
    "reference": "optional",
    "ratioKind": "size",
    "ratios": [
      "1024x1024",
      "1024x768",
      "768x1024",
      "1024x576",
      "576x1024"
    ]
  },
  {
    "id": "google/gemini-3.1-flash-image",
    "name": "Nano Banana 2 (Gemini 3.1 Flash Image)",
    "protocol": "gemini",
    "reference": "optional",
    "ratioKind": "aspect",
    "ratios": [
      "1:1",
      "1:4",
      "4:1",
      "1:8",
      "8:1",
      "2:3",
      "3:2",
      "4:3",
      "3:4",
      "9:16",
      "16:9",
      "21:9"
    ]
  },
  {
    "id": "google/gemini-3-pro-image",
    "name": "Nano Banana Pro (Gemini 3 Pro Image)",
    "protocol": "gemini",
    "reference": "optional",
    "ratioKind": "aspect",
    "ratios": [
      "1:1",
      "1:4",
      "4:1",
      "1:8",
      "8:1",
      "2:3",
      "3:2",
      "4:3",
      "3:4",
      "9:16",
      "16:9",
      "21:9"
    ]
  },
  {
    "id": "google/gemini-3.1-flash-lite-image",
    "name": "Nano Banana 2 Lite (Gemini 3.1 Flash-Lite Image)",
    "protocol": "gemini",
    "reference": "optional",
    "ratioKind": "aspect",
    "ratios": [
      "16:9",
      "9:16"
    ]
  },
  {
    "id": "bytedance/doubao-seedream-5.0-pro",
    "name": "Doubao-Seedream-5.0-pro",
    "protocol": "vertex",
    "reference": "optional",
    "ratioKind": "aspect",
    "ratios": [
      "1:1",
      "2:3",
      "3:2",
      "4:3",
      "3:4",
      "9:16",
      "16:9",
      "21:9"
    ]
  },
  {
    "id": "openai/gpt-image-1.5",
    "name": "GPT-Image-1.5",
    "protocol": "vertex",
    "reference": "optional",
    "ratioKind": "aspect",
    "ratios": [
      "1:1",
      "16:9",
      "9:16",
      "4:3",
      "3:4"
    ]
  },
  {
    "id": "qwen/qwen-image-3.0-pro",
    "name": "Qwen-Image-3.0-Pro",
    "protocol": "vertex",
    "reference": "optional",
    "ratioKind": "size",
    "ratios": [
      "1024x1024",
      "1024x1536",
      "1536x1024",
      "1152x2048",
      "2048x1152",
      "1536x2048",
      "2048x1536",
      "2048x2048"
    ]
  },
  {
    "id": "qwen/qwen-image-3.0",
    "name": "Qwen-Image-3.0",
    "protocol": "vertex",
    "reference": "optional",
    "ratioKind": "size",
    "ratios": [
      "1024x1024",
      "1024x1536",
      "1536x1024",
      "1152x2048",
      "2048x1152",
      "1536x2048",
      "2048x1536",
      "2048x2048"
    ]
  },
  {
    "id": "sapiens-ai/agnes-image-2.1-flash",
    "name": "Agnes Image 2.1 Flash",
    "protocol": "vertex",
    "reference": "optional",
    "ratioKind": "size",
    "ratios": [
      "1024x1024",
      "2048x2048",
      "3072x3072",
      "4096x4096",
      "864x1152",
      "1728x2304",
      "2592x3456",
      "3456x4608",
      "1152x864",
      "2304x1728",
      "3456x2592",
      "4608x3456",
      "1312x736",
      "2624x1472",
      "3936x2208",
      "5248x2944",
      "736x1312",
      "1472x2624",
      "2208x3936",
      "2944x5248",
      "832x1248",
      "1664x2496",
      "2496x3744",
      "3328x4992",
      "1248x832",
      "2496x1664",
      "3744x2496",
      "4992x3328",
      "1568x672",
      "3136x1344",
      "4704x2016",
      "6272x2688"
    ]
  },
  {
    "id": "klingai/kling-v3",
    "name": "Kling-v3",
    "protocol": "vertex",
    "reference": "optional",
    "ratioKind": "aspect",
    "ratios": [
      "1:1",
      "16:9",
      "9:16",
      "4:3",
      "3:4"
    ]
  },
  {
    "id": "meta/muse-image-1.0",
    "name": "Muse Image 1.0",
    "protocol": "vertex",
    "reference": "optional",
    "ratioKind": "size",
    "ratios": [
      "auto",
      "1024x1024",
      "1536x1024",
      "1024x1536",
      "2048x2048",
      "2048x1152",
      "3840x2160",
      "2160x3840"
    ]
  },
  {
    "id": "x-ai/grok-imagine-image-2.0",
    "name": "Grok Imagine Image 2.0",
    "protocol": "vertex",
    "reference": "optional",
    "ratioKind": "size",
    "ratios": [
      "1k",
      "2k"
    ]
  },
  {
    "id": "openai/gpt-image-2.5-sunburst",
    "name": "GPT-Image-2.5-Sunburst",
    "protocol": "vertex",
    "reference": "optional",
    "ratioKind": "size",
    "ratios": [
      "auto",
      "1024x1024",
      "1536x1024",
      "1024x1536",
      "2048x2048",
      "2048x1152",
      "3840x2160",
      "2160x3840",
      "1536x2048",
      "2048x1536"
    ]
  },
  {
    "id": "openai/gpt-image-2.5-flare",
    "name": "GPT-Image-2.5-Flare",
    "protocol": "vertex",
    "reference": "optional",
    "ratioKind": "size",
    "ratios": [
      "auto",
      "1024x1024",
      "1536x1024",
      "1024x1536",
      "2048x2048",
      "2048x1152",
      "3840x2160",
      "2160x3840",
      "1536x2048",
      "2048x1536"
    ]
  },
  {
    "id": "inclusionai/llada-image-turbo",
    "name": "LLaDA-Image-Turbo",
    "protocol": "vertex",
    "reference": "optional",
    "ratioKind": "size",
    "ratios": [
      "auto",
      "512x512",
      "1024x1024"
    ]
  },
  {
    "id": "inclusionai/ming-image-0.1-design",
    "name": "Ming Image 0.1 Design",
    "protocol": "gemini",
    "reference": "none",
    "ratioKind": "size",
    "ratios": [
      "1024x1024",
      "1536x1024",
      "1024x1536",
      "2048x2048",
      "2048x1152",
      "3840x2160",
      "2160x3840"
    ]
  },
  {
    "id": "inclusionai/ming-image-0.1-design-layer",
    "name": "Ming Image 0.1 Design Layer",
    "protocol": "gemini",
    "reference": "required",
    "ratioKind": "size",
    "ratios": [
      "1024x1024",
      "1536x1024",
      "1024x1536",
      "2048x2048",
      "2048x1152",
      "3840x2160",
      "2160x3840"
    ]
  }
];

export const VIDEO_CATALOG: readonly VideoCatalogEntry[] = [
  {
    "id": "google/veo-3.1-generate-001",
    "name": "Veo 3.1",
    "ratios": [
      "16:9",
      "9:16"
    ],
    "durations": [
      4,
      6,
      8
    ]
  },
  {
    "id": "google/veo-3.1-fast-generate-001",
    "name": "Veo 3.1 Fast",
    "ratios": [
      "16:9",
      "9:16"
    ],
    "durations": [
      4,
      6,
      8
    ]
  },
  {
    "id": "skyreels/skyreels-v4",
    "name": "V4",
    "ratios": [
      "16:9",
      "9:16",
      "4:3",
      "1:1",
      "3:4"
    ],
    "durations": [
      3,
      4,
      5,
      6,
      7,
      8,
      9,
      10,
      11,
      12,
      13,
      14,
      15
    ]
  },
  {
    "id": "google/veo-3.1-lite-generate-001",
    "name": "Veo 3.1 Lite",
    "ratios": [
      "16:9",
      "9:16"
    ],
    "durations": [
      4,
      6,
      8
    ]
  },
  {
    "id": "bytedance/doubao-seedance-1.5-pro",
    "name": "Doubao-Seedance-1.5-pro",
    "ratios": [
      "16:9",
      "4:3",
      "1:1",
      "3:4",
      "9:16",
      "21:9",
      "smart"
    ],
    "durations": [
      4,
      5,
      6,
      7,
      8,
      9,
      10,
      11,
      12
    ]
  },
  {
    "id": "bytedance/doubao-seedance-2.0",
    "name": "Doubao-Seedance-2.0",
    "ratios": [
      "21:9",
      "16:9",
      "4:3",
      "1:1",
      "3:4",
      "9:16",
      "smart"
    ],
    "durations": [
      4,
      5,
      6,
      7,
      8,
      9,
      10,
      11,
      12,
      13,
      14,
      15
    ]
  },
  {
    "id": "alibaba/happyhorse-1.0",
    "name": "HappyHorse 1.0",
    "ratios": [
      "16:9",
      "9:16",
      "1:1",
      "4:3",
      "3:4"
    ],
    "durations": [
      3,
      4,
      5,
      6,
      7,
      8,
      9,
      10,
      11,
      12,
      13,
      14,
      15
    ]
  },
  {
    "id": "sapiens-ai/agnes-video-v2.0",
    "name": "Agnes Video V2.0",
    "ratios": [
      "16:9",
      "9:16",
      "1:1",
      "4:3",
      "3:4"
    ],
    "durations": [
      1,
      2,
      3,
      4,
      5,
      6,
      7,
      8,
      9,
      10,
      11,
      12,
      13,
      14,
      15,
      16,
      17,
      18
    ]
  },
  {
    "id": "google/gemini-omni-flash-preview",
    "name": "Gemini Omni Flash Preview",
    "ratios": [
      "16:9",
      "9:16"
    ],
    "durations": [
      3,
      4,
      5,
      6,
      7,
      8,
      9,
      10
    ]
  },
  {
    "id": "minimax/minimax-h3",
    "name": "MiniMax H3",
    "ratios": [
      "21:9",
      "16:9",
      "4:3",
      "1:1",
      "3:4",
      "9:16"
    ],
    "durations": [
      4,
      5,
      6,
      7,
      8,
      9,
      10,
      11,
      12,
      13,
      14,
      15
    ]
  },
  {
    "id": "bytedance/doubao-seedance-2.5",
    "name": "Doubao-Seedance-2.5",
    "ratios": [
      "21:9",
      "16:9",
      "4:3",
      "1:1",
      "3:4",
      "9:16",
      "smart"
    ],
    "durations": [
      4,
      5,
      6,
      7,
      8,
      9,
      10,
      11,
      12,
      13,
      14,
      15,
      16,
      17,
      18,
      19,
      20,
      21,
      22,
      23,
      24,
      25,
      26,
      27,
      28,
      29,
      30
    ]
  },
  {
    "id": "bfl/flux-3-video",
    "name": "FLUX.3 Video",
    "ratios": [
      "21:9",
      "2:1",
      "16:9",
      "4:3",
      "1:1",
      "3:4",
      "9:16",
      "smart"
    ],
    "durations": [
      5,
      6,
      7,
      8,
      9,
      10,
      11,
      12,
      13,
      14,
      15,
      16,
      17,
      18,
      19,
      20
    ]
  },
  {
    "id": "pixverse/c1",
    "name": "C1",
    "ratios": [
      "21:9",
      "16:9",
      "4:3",
      "1:1",
      "3:4",
      "9:16"
    ],
    "durations": [
      1,
      2,
      3,
      4,
      5,
      6,
      7,
      8,
      9,
      10,
      11,
      12,
      13,
      14,
      15
    ]
  },
  {
    "id": "pixverse/v6",
    "name": "V6",
    "ratios": [
      "21:9",
      "16:9",
      "4:3",
      "1:1",
      "3:4",
      "9:16"
    ],
    "durations": [
      1,
      2,
      3,
      4,
      5,
      6,
      7,
      8,
      9,
      10,
      11,
      12,
      13,
      14,
      15
    ]
  },
  {
    "id": "alibaba/wan3.0-video",
    "name": "Wan3.0-Video",
    "ratios": [
      "adaptive",
      "16:9",
      "4:3",
      "1:1",
      "3:4",
      "9:16"
    ],
    "durations": [
      2,
      3,
      4,
      5,
      6,
      7,
      8,
      9,
      10,
      11,
      12,
      13,
      14,
      15,
      16,
      17,
      18,
      19,
      20,
      21,
      22,
      23,
      24,
      25,
      26,
      27,
      28,
      29,
      30
    ]
  },
  {
    "id": "alibaba/wan3.0-video-prime",
    "name": "Wan3.0-Video-Prime",
    "ratios": [
      "adaptive",
      "16:9",
      "4:3",
      "1:1",
      "3:4",
      "9:16"
    ],
    "durations": [
      2,
      3,
      4,
      5,
      6,
      7,
      8,
      9,
      10,
      11,
      12,
      13,
      14,
      15,
      16,
      17,
      18,
      19,
      20,
      21,
      22,
      23,
      24,
      25,
      26,
      27,
      28,
      29,
      30
    ]
  },
  {
    "id": "google/gemini-omni-1.1-flash-preview",
    "name": "Gemini Omni 1.1 Flash Preview",
    "ratios": [
      "16:9",
      "9:16"
    ],
    "durations": [
      3,
      4,
      5,
      6,
      7,
      8,
      9,
      10
    ]
  },
  {
    "id": "minimax/minimax-h3-max",
    "name": "MiniMax H3 Max",
    "ratios": [
      "21:9",
      "16:9",
      "4:3",
      "1:1",
      "3:4",
      "9:16"
    ],
    "durations": [
      5,
      6,
      7,
      8,
      9,
      10,
      11,
      12,
      13,
      14,
      15
    ]
  },
  {
    "id": "klingai/kling-3.0-omni",
    "name": "Kling-3.0-Omni",
    "ratios": [
      "16:9",
      "1:1",
      "9:16",
      "smart"
    ],
    "durations": [
      3,
      4,
      5,
      6,
      7,
      8,
      9,
      10,
      11,
      12,
      13,
      14,
      15
    ]
  },
  {
    "id": "klingai/kling-3.0",
    "name": "Kling-3.0",
    "ratios": [
      "16:9",
      "1:1",
      "9:16",
      "smart"
    ],
    "durations": [
      3,
      4,
      5,
      6,
      7,
      8,
      9,
      10,
      11,
      12,
      13,
      14,
      15
    ]
  },
  {
    "id": "klingai/kling-3.0-turbo",
    "name": "Kling-3.0-Turbo",
    "ratios": [
      "16:9",
      "1:1",
      "9:16",
      "smart"
    ],
    "durations": [
      3,
      4,
      5,
      6,
      7,
      8,
      9,
      10,
      11,
      12,
      13,
      14,
      15
    ]
  }
];

export const CUSTOM_IMAGE_RATIOS = ["1:1", "16:9", "9:16", "4:3", "3:4", "3:2", "2:3"] as const;
export const CUSTOM_VIDEO_RATIOS = ["16:9", "9:16", "1:1", "4:3", "3:4"] as const;
export const CUSTOM_VIDEO_DURATIONS = [4, 5, 6, 8, 10] as const;
