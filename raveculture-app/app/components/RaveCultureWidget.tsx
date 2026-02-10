"use client";

import { useState, useCallback } from "react";
import { useAccount, useConnect } from "wagmi";
import { coinbaseWallet } from "wagmi/connectors";

type MintState = "idle" | "connecting" | "minting" | "success" | "error";

/**
 * RaveCulture mint widget.
 * Wallet connects only when user clicks mint — invisible until needed.
 * Calls /api/bankr-mint server route. Never talks to Bankr directly.
 */
export function RaveCultureWidget() {
  const { address, isConnected } = useAccount();
  const { connectAsync } = useConnect();
  const [mintState, setMintState] = useState<MintState>("idle");
  const [error, setError] = useState<string | null>(null);

  const handleMint = useCallback(async () => {
    try {
      setError(null);
      let walletAddress = address;

      // Connect wallet on demand — invisible until this moment
      if (!isConnected || !walletAddress) {
        setMintState("connecting");
        const result = await connectAsync({
          connector: coinbaseWallet({ appName: "RaveCulture" }),
        });
        walletAddress = result.accounts[0];
      }

      if (!walletAddress) {
        throw new Error("No wallet address available");
      }

      setMintState("minting");

      const res = await fetch("/api/bankr-mint", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          walletAddress,
          assetName: "RavePass",
        }),
      });

      const data = await res.json();

      if (!res.ok || !data.success) {
        throw new Error(data.error || "Mint failed");
      }

      setMintState("success");
    } catch (err: any) {
      setError(err.message || "Something went wrong");
      setMintState("error");
    }
  }, [address, isConnected, connectAsync]);

  return (
    <div className="flex flex-col items-center gap-4">
      <button
        onClick={handleMint}
        disabled={mintState === "minting" || mintState === "connecting"}
        className="rounded-full bg-white text-black px-8 py-3 font-semibold text-lg
                   hover:bg-neutral-200 transition-colors disabled:opacity-50
                   disabled:cursor-not-allowed"
      >
        {mintState === "connecting" && "Connecting…"}
        {mintState === "minting" && "Minting…"}
        {mintState === "success" && "Minted ✓"}
        {(mintState === "idle" || mintState === "error") && "Mint RavePass"}
      </button>

      {error && (
        <p className="text-red-400 text-sm">{error}</p>
      )}

      {mintState === "success" && (
        <p className="text-green-400 text-sm">
          RavePass minted. Welcome to the culture.
        </p>
      )}
    </div>
  );
}
