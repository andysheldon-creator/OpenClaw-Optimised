import { RaveCultureWidget } from "./components/RaveCultureWidget";

/**
 * Landing page — brand-first, no wallet prompt on load.
 * Users see culture content first. Wallet connects only when they take action.
 */
export default function Home() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-black text-white">
      <div className="max-w-2xl px-6 text-center">
        <h1 className="text-5xl font-bold tracking-tight mb-4">
          RaveCulture
        </h1>
        <p className="text-lg text-neutral-400 mb-12">
          Base-native onchain culture. Events. Streams. Drops.
        </p>

        <RaveCultureWidget />
      </div>
    </main>
  );
}
