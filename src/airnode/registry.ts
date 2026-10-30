import type { Address } from 'viem';

// Each listing's URL and the address its Airnode signs with, copied from the listing's own spec (GET /, x-airnode.address)
// on 2026-10-30. A response from any other signer is rejected.
export const AIRNODES = {
  twitter: { url: 'https://airnode-twitterapi.fly.dev/', address: '0x7B02Fd3324D2dC362f65a9c01e59EC5fDb4E1CCB' },
  benzinga: { url: 'https://airnode-benzinga.fly.dev/', address: '0x3ef281Ce478c412552d2146273fEE3BBB4e3D4Ba' },
  openrouter: { url: 'https://airnode-openrouter.fly.dev/', address: '0x68B39A664eaD9781107B4498BEeC8AAc4E6F3b33' },
  tickerlayer: { url: 'https://airnode-tickerlayer.fly.dev/', address: '0x32f5eA20F05fdADfCD50Cb8eD920acE96D5f9f2c' },
  nodary: { url: 'https://airnode-nodary.fly.dev/', address: '0xE70f1e8b22a21e4Bb5188918a3033341b281E4c0' },
} as const satisfies Record<string, { url: string; address: Address }>;

export type AirnodeName = keyof typeof AIRNODES;
