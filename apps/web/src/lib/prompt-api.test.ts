import { describe, it, expect } from "bun:test"
import { convertToApiParts } from "./prompt-api"
import type { Prompt } from "@/types/prompt"

describe("convertToApiParts", () => {
	const directory = "/Users/test/project"

	describe("text parts", () => {
		it("combines multiple text parts into single text part", () => {
			const prompt: Prompt = [
				{ type: "text", content: "Hello ", start: 0, end: 6 },
				{ type: "text", content: "world", start: 6, end: 11 },
			]

			const result = convertToApiParts(prompt, directory)

			expect(result).toHaveLength(1)
			expect(result[0]).toMatchObject({
				type: "text",
				text: "Hello world",
			})
			expect(result[0].id).toBeDefined()
		})

		it("handles empty prompt with empty text part", () => {
			const prompt: Prompt = []

			const result = convertToApiParts(prompt, directory)

			expect(result).toHaveLength(1)
			expect(result[0]).toMatchObject({
				type: "text",
				text: "",
			})
		})

		it("handles only text parts", () => {
			const prompt: Prompt = [{ type: "text", content: "Just text", start: 0, end: 9 }]

			const result = convertToApiParts(prompt, directory)

			expect(result).toHaveLength(1)
			expect(result[0]).toMatchObject({
				type: "text",
				text: "Just text",
			})
		})
	})

	describe("file attachment parts", () => {
		it("converts file attachment to FilePartInput with file:// URL", () => {
			const prompt: Prompt = [
				{ type: "text", content: "Check ", start: 0, end: 6 },
				{
					type: "file",
					path: "src/app.ts",
					content: "@src/app.ts",
					start: 6,
					end: 17,
				},
			]

			const result = convertToApiParts(prompt, directory)

			expect(result).toHaveLength(2)
			expect(result[0]).toMatchObject({
				type: "text",
				text: "Check ",
			})
			expect(result[1]).toMatchObject({
				type: "file",
				mime: "text/plain",
				url: "file:///Users/test/project/src/app.ts",
				filename: "app.ts",
			})
		})

		it("converts absolute path file attachment", () => {
			const prompt: Prompt = [
				{
					type: "file",
					path: "/absolute/path/file.ts",
					content: "@/absolute/path/file.ts",
					start: 0,
					end: 23,
				},
			]

			const result = convertToApiParts(prompt, directory)

			expect(result).toHaveLength(2) // text + file
			expect(result[1]).toMatchObject({
				type: "file",
				url: "file:///absolute/path/file.ts",
				filename: "file.ts",
			})
		})

		it("adds query params for line selection", () => {
			const prompt: Prompt = [
				{
					type: "file",
					path: "src/utils.ts",
					content: "@src/utils.ts",
					start: 0,
					end: 13,
					selection: {
						startLine: 10,
						endLine: 20,
					},
				},
			]

			const result = convertToApiParts(prompt, directory)

			expect(result[1]).toMatchObject({
				type: "file",
				url: "file:///Users/test/project/src/utils.ts?start=10&end=20",
			})
		})

		it("includes source metadata with text value", () => {
			const prompt: Prompt = [
				{
					type: "file",
					path: "src/config.ts",
					content: "@src/config.ts",
					start: 5,
					end: 19,
				},
			]

			const result = convertToApiParts(prompt, directory)

			expect(result[1]).toMatchObject({
				type: "file",
				source: {
					type: "file",
					path: "/Users/test/project/src/config.ts",
					text: {
						value: "@src/config.ts",
						start: 5,
						end: 19,
					},
				},
			})
		})
	})

	describe("mixed parts", () => {
		it("converts prompt with text and file attachments", () => {
			const prompt: Prompt = [
				{ type: "text", content: "Fix bug in ", start: 0, end: 11 },
				{
					type: "file",
					path: "src/auth.ts",
					content: "@src/auth.ts",
					start: 11,
					end: 23,
				},
				{ type: "text", content: " please", start: 23, end: 30 },
			]

			const result = convertToApiParts(prompt, directory)

			expect(result).toHaveLength(2) // Combined text + 1 file
			expect(result[0]).toMatchObject({
				type: "text",
				text: "Fix bug in  please", // Note: file content not in text
			})
			expect(result[1]).toMatchObject({
				type: "file",
				url: "file:///Users/test/project/src/auth.ts",
			})
		})

		it("handles multiple file attachments", () => {
			const prompt: Prompt = [
				{ type: "text", content: "Compare ", start: 0, end: 8 },
				{
					type: "file",
					path: "src/old.ts",
					content: "@src/old.ts",
					start: 8,
					end: 19,
				},
				{ type: "text", content: " and ", start: 19, end: 24 },
				{
					type: "file",
					path: "src/new.ts",
					content: "@src/new.ts",
					start: 24,
					end: 35,
				},
			]

			const result = convertToApiParts(prompt, directory)

			expect(result).toHaveLength(3) // text + 2 files
			expect(result[0].type).toBe("text")
			expect(result[1].type).toBe("file")
			expect(result[2].type).toBe("file")
		})
	})

	describe("ID generation", () => {
		it("generates unique IDs for each part", () => {
			const prompt: Prompt = [
				{ type: "text", content: "Test", start: 0, end: 4 },
				{
					type: "file",
					path: "a.ts",
					content: "@a.ts",
					start: 4,
					end: 9,
				},
				{
					type: "file",
					path: "b.ts",
					content: "@b.ts",
					start: 9,
					end: 14,
				},
			]

			const result = convertToApiParts(prompt, directory)

			const ids = result.map((p) => p.id)
			const uniqueIds = new Set(ids)

			expect(uniqueIds.size).toBe(ids.length) // All IDs unique
			expect(ids.every((id) => typeof id === "string" && id.length > 0)).toBe(true)
		})
	})

	describe("filename extraction", () => {
		it("extracts filename from path", () => {
			const prompt: Prompt = [
				{
					type: "file",
					path: "src/components/Button.tsx",
					content: "@src/components/Button.tsx",
					start: 0,
					end: 27,
				},
			]

			const result = convertToApiParts(prompt, directory)

			expect(result[1]).toMatchObject({
				filename: "Button.tsx",
			})
		})

		it("handles path without directory", () => {
			const prompt: Prompt = [
				{
					type: "file",
					path: "index.ts",
					content: "@index.ts",
					start: 0,
					end: 9,
				},
			]

			const result = convertToApiParts(prompt, directory)

			expect(result[1]).toMatchObject({
				filename: "index.ts",
			})
		})
	})
})
