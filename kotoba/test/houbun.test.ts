import { describe, it, expect, beforeEach } from "vitest";
import { MockEtzhayyim } from "@etzhayyim/sdk-mock";
import {
  registerArticle,
  getArticle,
  recordAmendment,
  listArticles,
} from "../src/index.js";

describe("houbun kotoba", () => {
  let e: any;

  beforeEach(() => {
    e = new MockEtzhayyim({ did: "did:web:houbun.etzhayyim.com" });
  });

  describe("registerArticle", () => {
    it("registers article with content-addressed blake3_12", async () => {
      const result = await registerArticle(e, {
        articleId: "article-2024-001",
        title: "Contract Agreement",
        content: "This is the full text of the contract...",
      });

      expect(result.status).toBe("registered");
      expect(result.articleUri).toBeDefined();
      expect(result.contentHash).toBeDefined();
    });

    it("is idempotent on same content (content-addressed)", async () => {
      const input = {
        articleId: "article-2024-001",
        title: "Contract Agreement",
        content: "This is the full text of the contract...",
      };

      const first = await registerArticle(e, input);
      expect(first.status).toBe("registered");

      const second = await registerArticle(e, input);
      expect(second.status).toBe("alreadyExists");
      expect(second.contentHash).toBe(first.contentHash);
    });

    it("supports optional amendment field", async () => {
      const result = await registerArticle(e, {
        articleId: "article-2024-002",
        title: "Updated Contract",
        content: "New content...",
        amendment: "v2",
      });

      expect(result.status).toBe("registered");
      expect(result.amendment).toBe("v2");
    });
  });

  describe("getArticle", () => {
    beforeEach(async () => {
      await registerArticle(e, {
        articleId: "article-2024-001",
        title: "Contract Agreement",
        content: "This is the full text of the contract...",
      });
    });

    it("retrieves article by id", async () => {
      const result = await getArticle(e, { articleId: "article-2024-001" });

      expect(result.article).toBeDefined();
      expect(result.article?.title).toBe("Contract Agreement");
      expect(result.article?.contentHash).toBeDefined();
    });

    it("returns notFound for nonexistent article", async () => {
      const result = await getArticle(e, { articleId: "nonexistent" });

      expect(result.error).toBe("notFound");
    });
  });

  describe("recordAmendment", () => {
    beforeEach(async () => {
      await registerArticle(e, {
        articleId: "article-v1",
        title: "Contract v1",
        content: "Original contract...",
      });
      await registerArticle(e, {
        articleId: "article-v2",
        title: "Contract v2",
        content: "Updated contract with amendments...",
      });
    });

    it("records amendment lineage from v1 to v2", async () => {
      const result = await recordAmendment(e, {
        amendmentId: "amend-1",
        fromArticleDids: ["did:web:houbun.etzhayyim.com/articles/article-v1"],
        toArticleDids: ["did:web:houbun.etzhayyim.com/articles/article-v2"],
      });

      expect(result.status).toBe("recorded");
      expect(result.amendmentUri).toBeDefined();
    });

    it("ties multiple fromArticleDids to multiple toArticleDids", async () => {
      const result = await recordAmendment(e, {
        amendmentId: "amend-2",
        fromArticleDids: [
          "did:web:houbun.etzhayyim.com/articles/article-v1",
          "did:web:houbun.etzhayyim.com/articles/old-contract",
        ],
        toArticleDids: ["did:web:houbun.etzhayyim.com/articles/article-v2"],
      });

      expect(result.status).toBe("recorded");
    });

    it("is idempotent on amendmentId", async () => {
      const input = {
        amendmentId: "amend-1",
        fromArticleDids: ["did:web:houbun.etzhayyim.com/articles/article-v1"],
        toArticleDids: ["did:web:houbun.etzhayyim.com/articles/article-v2"],
      };

      const first = await recordAmendment(e, input);
      expect(first.status).toBe("recorded");

      const second = await recordAmendment(e, input);
      expect(second.status).toBe("alreadyRecorded");
    });
  });

  describe("listArticles", () => {
    beforeEach(async () => {
      await registerArticle(e, {
        articleId: "article-2024-001",
        title: "Contract Agreement",
        content: "This is the full text of the contract...",
      });
      await registerArticle(e, {
        articleId: "article-2024-002",
        title: "Treaty Document",
        content: "International treaty text...",
      });
    });

    it("lists all registered articles", async () => {
      const result = await listArticles(e, {});

      expect(result.items.length).toBeGreaterThanOrEqual(2);
    });

    it("filters articles by title substring", async () => {
      const result = await listArticles(e, { titleSearch: "Contract" });

      expect(
        result.items.every((a) => a.title.includes("Contract"))
      ).toBe(true);
    });
  });
});
