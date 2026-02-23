const RESET = "\x1b[0m";
const BOLD = "\x1b[1m";
const DIM = "\x1b[2m";
const GREEN = "\x1b[32m";
const CYAN = "\x1b[36m";
const YELLOW = "\x1b[33m";
const RED = "\x1b[31m";
const MAGENTA = "\x1b[35m";
const WHITE = "\x1b[37m";

export class PipelineLogger {
  private startTime = Date.now();

  banner(): void {
    console.log(`\n${BOLD}${CYAN}╔══════════════════════════════════════════════════╗${RESET}`);
    console.log(`${BOLD}${CYAN}║   7-Agent Autonomous QA Pipeline  v1.0           ║${RESET}`);
    console.log(`${BOLD}${CYAN}╚══════════════════════════════════════════════════╝${RESET}\n`);
    console.log(`${DIM}  Started: ${new Date().toISOString()}${RESET}\n`);
  }

  phase(agentNum: number, code: string, name: string): void {
    const elapsed = this.elapsed();
    console.log(`\n${BOLD}${MAGENTA}┌─ [${code}] ${name} ${DIM}(+${elapsed})${RESET}`);
  }

  done(message: string): void {
    console.log(`${GREEN}│  ✓ ${message}${RESET}`);
  }

  info(message: string): void {
    console.log(`${CYAN}│  ℹ ${message}${RESET}`);
  }

  warn(message: string): void {
    console.log(`${YELLOW}│  ⚠ ${message}${RESET}`);
  }

  error(message: string): void {
    console.log(`${RED}│  ✗ ${message}${RESET}`);
  }

  complete(message: string): void {
    const elapsed = this.elapsed();
    console.log(`\n${BOLD}${GREEN}══════════════════════════════════════════════════`);
    console.log(`  ${message}`);
    console.log(`  Total elapsed: ${elapsed}`);
    console.log(`══════════════════════════════════════════════════${RESET}\n`);
  }

  private elapsed(): string {
    const ms = Date.now() - this.startTime;
    if (ms < 1000) return `${ms}ms`;
    if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
    return `${Math.floor(ms / 60000)}m ${Math.floor((ms % 60000) / 1000)}s`;
  }
}
