import type { Command } from '../Command'

export abstract class AbstractUpdateCommand<T> implements Command {
  constructor(
    protected readonly before: T,
    protected readonly after: T,
  ) {}

  execute() {
    this.apply(this.after)
  }

  undo() {
    this.apply(this.before)
  }

  protected abstract apply(state: T): void
}
