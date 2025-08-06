import { load } from "cheerio";
import { HtmlParser, ParsedDocument, ParsedElement } from "../types/interfaces";

/**
 * Cheerio-based HTML parser implementation
 * Following Single Responsibility Principle - only parses HTML
 * Following Dependency Inversion Principle - implements HtmlParser interface
 */
export class CheerioParser implements HtmlParser {
  parse(html: string): ParsedDocument {
    const $ = load(html);
    return new CheerioParsedDocument($);
  }
}

/**
 * Cheerio-based parsed document implementation
 */
class CheerioParsedDocument implements ParsedDocument {
  constructor(private readonly $: ReturnType<typeof load>) {}

  findAll(selector: string): ParsedElement[] {
    const elements: ParsedElement[] = [];
    this.$(selector).each((_: number, element: any) => {
      elements.push(new CheerioParsedElement(this.$, element));
    });
    return elements;
  }
}

/**
 * Cheerio-based parsed element implementation
 */
class CheerioParsedElement implements ParsedElement {
  constructor(
    private readonly $: ReturnType<typeof load>,
    private readonly element: any
  ) {}

  getAttribute(name: string): string | null {
    return this.$(this.element).attr(name) || null;
  }

  getText(): string {
    return this.$(this.element).text().trim();
  }
}
