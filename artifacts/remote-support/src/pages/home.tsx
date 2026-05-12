import { useEffect, useState } from "react";
import { Link } from "wouter";
import { ThemeProvider } from "@/components/theme-provider";

function Home() {
  return (
    <div className="min-h-screen w-full flex flex-col items-center justify-center p-4">
      <div className="text-center max-w-md w-full p-8 border border-border bg-card">
        <h1 className="text-2xl font-bold mb-6 text-primary tracking-widest uppercase">REMOTE OPS CENTER</h1>
        <div className="flex flex-col gap-4">
          <Link href="/expert" className="w-full">
            <div className="w-full flex items-center justify-between p-4 border border-border hover:border-primary hover:bg-accent hover:text-accent-foreground transition-colors cursor-pointer group">
              <span className="font-bold tracking-wider">EXPERT DASHBOARD</span>
              <span className="text-primary group-hover:translate-x-1 transition-transform">-&gt;</span>
            </div>
          </Link>
          <Link href="/node" className="w-full">
            <div className="w-full flex items-center justify-between p-4 border border-border hover:border-primary hover:bg-accent hover:text-accent-foreground transition-colors cursor-pointer group">
              <span className="font-bold tracking-wider">NODE CLIENT</span>
              <span className="text-primary group-hover:translate-x-1 transition-transform">-&gt;</span>
            </div>
          </Link>
        </div>
      </div>
    </div>
  );
}

export default Home;
