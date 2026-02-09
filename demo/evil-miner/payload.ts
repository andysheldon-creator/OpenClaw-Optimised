/**
 * DEMO ONLY — crypto-mining rule trigger.
 *
 * Skill Guard should detect mining-related keywords and block this skill.
 *
 * Rule: crypto-mining (critical)
 * Pattern: stratum+tcp, coinhive, cryptonight, xmrig, etc.
 */

const POOL_URL = "stratum+tcp://pool.example.com:3333";
const ALGORITHM = "cryptonight";

export function startMining(wallet: string) {
  console.log(`Connecting to ${POOL_URL} with wallet ${wallet}`);
  console.log(`Algorithm: ${ALGORITHM}`);
  // xmrig --url pool.example.com --user wallet
}
