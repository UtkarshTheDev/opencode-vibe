/**
 * Tests for Autocomplete dropdown component
 *
 * TDD approach:
 * 1. Test null rendering (type=null or empty items)
 * 2. Test file autocomplete rendering
 * 3. Test command autocomplete rendering
 * 4. Test selection highlighting
 * 5. Test click handlers
 */

import { describe, it, expect, vi } from "bun:test"
import { render } from "@testing-library/react"
import { JSDOM } from "jsdom"
import { Autocomplete } from "./Autocomplete"
import type { SlashCommand } from "@/types/prompt"

// Setup DOM environment for React Testing Library
const dom = new JSDOM("<!DOCTYPE html><html><body></body></html>", {
	url: "http://localhost",
})
global.document = dom.window.document as unknown as Document
global.window = dom.window as unknown as Window & typeof globalThis
global.navigator = dom.window.navigator

describe("Autocomplete", () => {
	describe("null rendering", () => {
		it("returns null when type is null", () => {
			const { container } = render(
				<Autocomplete type={null} items={["some-file.ts"]} selectedIndex={0} onSelect={vi.fn()} />,
			)
			expect(container.firstChild).toBe(null)
		})

		it("shows empty state message when items is empty", () => {
			const { container } = render(
				<Autocomplete type="file" items={[]} selectedIndex={0} onSelect={vi.fn()} />,
			)
			// Component now shows "No files found" instead of returning null
			expect(container.textContent).toContain("No files found")
		})
	})

	describe("file autocomplete", () => {
		it("renders file paths with directory and filename separated", () => {
			const files = ["src/app/page.tsx", "src/lib/utils.ts"]

			const { container } = render(
				<Autocomplete type="file" items={files} selectedIndex={0} onSelect={vi.fn()} />,
			)

			const text = container.textContent
			expect(text).toContain("page.tsx")
			expect(text).toContain("utils.ts")
			expect(text).toContain("src/app/")
			expect(text).toContain("src/lib/")
		})

		it("handles root-level files (no directory)", () => {
			const { container } = render(
				<Autocomplete type="file" items={["README.md"]} selectedIndex={0} onSelect={vi.fn()} />,
			)

			expect(container.textContent).toContain("README.md")
		})

		it("highlights selected file", () => {
			const files = ["src/app/page.tsx", "src/lib/utils.ts"]

			const { container, rerender } = render(
				<Autocomplete type="file" items={files} selectedIndex={0} onSelect={vi.fn()} />,
			)

			// First item should be highlighted with accent background
			const items = container.querySelectorAll("button")
			expect(items[0]?.className).toContain("bg-accent")
			expect(items[1]?.className).not.toContain("bg-accent text-accent-foreground")

			// Change selection
			rerender(<Autocomplete type="file" items={files} selectedIndex={1} onSelect={vi.fn()} />)

			// Now second item should be highlighted
			const newItems = container.querySelectorAll("button")
			expect(newItems[1]?.className).toContain("bg-accent")
		})

		it("calls onSelect when file is clicked", () => {
			const onSelect = vi.fn()
			const files = ["src/app/page.tsx", "src/lib/utils.ts"]

			const { container } = render(
				<Autocomplete type="file" items={files} selectedIndex={0} onSelect={onSelect} />,
			)

			const firstFile = container.querySelector("button")
			if (!firstFile) throw new Error("First file not found")

			firstFile.click()

			expect(onSelect).toHaveBeenCalledTimes(1)
			expect(onSelect).toHaveBeenCalledWith("src/app/page.tsx")
		})
	})

	describe("command autocomplete", () => {
		const mockCommands: SlashCommand[] = [
			{
				id: "swarm",
				trigger: "swarm",
				title: "Swarm",
				description: "Decompose and parallelize task",
				keybind: "mod+shift+s",
				type: "builtin",
			},
			{
				id: "fix-all",
				trigger: "fix-all",
				title: "Fix All",
				description: "Dispatch agents to fix issues",
				type: "builtin",
			},
			{
				id: "my-custom",
				trigger: "my-custom",
				title: "My Custom",
				description: "Custom command",
				keybind: "mod+k",
				type: "custom",
			},
		]

		it("renders command list with trigger and description", () => {
			const { container } = render(
				<Autocomplete type="command" items={mockCommands} selectedIndex={0} onSelect={vi.fn()} />,
			)

			const text = container.textContent
			expect(text).toContain("/swarm")
			expect(text).toContain("/fix-all")
			expect(text).toContain("/my-custom")
			expect(text).toContain("Decompose and parallelize task")
			expect(text).toContain("Dispatch agents to fix issues")
		})

		it("shows custom badge for custom commands", () => {
			const { container } = render(
				<Autocomplete type="command" items={mockCommands} selectedIndex={0} onSelect={vi.fn()} />,
			)

			expect(container.textContent).toContain("custom")
		})

		it("highlights selected command", () => {
			const { container, rerender } = render(
				<Autocomplete type="command" items={mockCommands} selectedIndex={1} onSelect={vi.fn()} />,
			)

			const items = container.querySelectorAll("button")
			expect(items[1]?.className).toContain("bg-accent")

			// Change selection to first
			rerender(
				<Autocomplete type="command" items={mockCommands} selectedIndex={0} onSelect={vi.fn()} />,
			)

			const newItems = container.querySelectorAll("button")
			expect(newItems[0]?.className).toContain("bg-accent")
		})

		it("calls onSelect with command object when clicked", () => {
			const onSelect = vi.fn()

			const { container } = render(
				<Autocomplete type="command" items={mockCommands} selectedIndex={0} onSelect={onSelect} />,
			)

			const firstCommand = container.querySelector("button")
			if (!firstCommand) throw new Error("Command not found")

			firstCommand.click()

			expect(onSelect).toHaveBeenCalledTimes(1)
			expect(onSelect).toHaveBeenCalledWith(mockCommands[0])
		})

		it("renders command without description", () => {
			const commandWithoutDesc: SlashCommand = {
				id: "minimal",
				trigger: "minimal",
				title: "Minimal",
				type: "builtin",
			}

			const { container } = render(
				<Autocomplete
					type="command"
					items={[commandWithoutDesc]}
					selectedIndex={0}
					onSelect={vi.fn()}
				/>,
			)

			expect(container.textContent).toContain("/minimal")
		})
	})

	describe("positioning and styling", () => {
		it("has absolute positioning with bottom-full (above input)", () => {
			const { container } = render(
				<Autocomplete type="file" items={["file.ts"]} selectedIndex={0} onSelect={vi.fn()} />,
			)

			const dropdown = container.querySelector("div")
			expect(dropdown?.className).toContain("absolute")
			expect(dropdown?.className).toContain("bottom-full")
		})

		it("has max-height with overflow-auto", () => {
			const { container } = render(
				<Autocomplete type="file" items={["file.ts"]} selectedIndex={0} onSelect={vi.fn()} />,
			)

			const dropdown = container.querySelector("div")
			expect(dropdown?.className).toContain("max-h-80")
			expect(dropdown?.className).toContain("overflow-auto")
		})

		it("has popover background classes", () => {
			const { container } = render(
				<Autocomplete type="file" items={["file.ts"]} selectedIndex={0} onSelect={vi.fn()} />,
			)

			const dropdown = container.querySelector("div")
			expect(dropdown?.className).toContain("bg-popover")
		})
	})
})
