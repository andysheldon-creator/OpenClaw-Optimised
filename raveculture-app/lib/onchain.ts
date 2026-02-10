import { createPublicClient, http, type Address } from "viem";
import { base } from "viem/chains";

/**
 * Public client for Base chain reads (token gating checks).
 * Single instance — no reconnects, no remounts.
 */
const publicClient = createPublicClient({
  chain: base,
  transport: http(),
});

// Minimal ERC-721 ABI for balance checks
const ERC721_BALANCE_ABI = [
  {
    inputs: [{ name: "owner", type: "address" }],
    name: "balanceOf",
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view",
    type: "function",
  },
] as const;

// Minimal ERC-20 ABI for balance checks
const ERC20_BALANCE_ABI = [
  {
    inputs: [{ name: "account", type: "address" }],
    name: "balanceOf",
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view",
    type: "function",
  },
] as const;

/**
 * Check if an address owns a RavePass NFT (ERC-721).
 * Used for token gating — no soft gating, no preview bypasses.
 */
export async function ownsRavePass(address: Address): Promise<boolean> {
  const tokenAddress = process.env.RAVECULTURE_TOKEN_ADDRESS as Address;

  if (!tokenAddress) {
    throw new Error("RAVECULTURE_TOKEN_ADDRESS not configured");
  }

  const balance = await publicClient.readContract({
    address: tokenAddress,
    abi: ERC721_BALANCE_ABI,
    functionName: "balanceOf",
    args: [address],
  });

  return balance > 0n;
}

/**
 * Check if an address has valid access (ERC-20 token balance).
 * Minimum balance of 1 token required.
 */
export async function isValidAccess(
  address: Address,
  tokenAddress: Address,
  minBalance: bigint = 1n
): Promise<boolean> {
  const balance = await publicClient.readContract({
    address: tokenAddress,
    abi: ERC20_BALANCE_ABI,
    functionName: "balanceOf",
    args: [address],
  });

  return balance >= minBalance;
}
