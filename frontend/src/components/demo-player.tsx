"use client";

import { Player } from "@remotion/player";
import { DemoComposition, DEMO_DURATION, DEMO_FPS } from "./demo-video";

export default function DemoPlayer() {
  return (
    <div className="w-full max-w-4xl mx-auto rounded-xl overflow-hidden border border-zinc-800 shadow-2xl shadow-black/50">
      <Player
        component={DemoComposition}
        durationInFrames={DEMO_DURATION}
        compositionWidth={960}
        compositionHeight={540}
        fps={DEMO_FPS}
        autoPlay
        loop
        style={{
          width: "100%",
          aspectRatio: "16/9",
        }}
        controls
      />
    </div>
  );
}
