import { NextRequest, NextResponse } from "next/server";
import { BankrClient } from "@bankr/sdk";

/**
 * Server-only Bankr mint route.
 * Private keys never touch the browser. Frontend calls this route exclusively.
 * Pattern copied from BANKR-INTEGRATION-SPEC.md — do not deviate.
 */
export async function POST(req: NextRequest) {
  try {
    const { walletAddress, assetName } = await req.json();

    if (!walletAddress || !assetName) {
      return NextResponse.json(
        { error: "Missing parameters" },
        { status: 400 }
      );
    }

    // Validate wallet address format
    if (!/^0x[a-fA-F0-9]{40}$/.test(walletAddress)) {
      return NextResponse.json(
        { error: "Invalid wallet address" },
        { status: 400 }
      );
    }

    const bankr = new BankrClient({
      apiKey: process.env.NEXT_PUBLIC_BANKR_API_KEY!,
      privateKey: process.env.BANKR_PRIVATE_KEY!,
      network: "base",
    });

    const response = await bankr.promptAndWait({
      prompt: `mint an NFT called ${assetName} for ${walletAddress} on base`,
    });

    return NextResponse.json({ success: true, data: response });
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message || "Mint failed" },
      { status: 500 }
    );
  }
}
