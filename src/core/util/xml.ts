import { XMLParser } from 'fast-xml-parser';

/** Parses an XML manifest (pom.xml, .csproj) into a plain object. `arrayTags` forces those
 * elements to always parse as arrays, since fast-xml-parser otherwise returns a bare object
 * when there is exactly one, which would silently break code that expects `.map()`/`.filter()`
 * to work on a repo with only a single dependency declared. */
export function parseXml<T>(xml: string, arrayTags: readonly string[]): T {
  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: '@_',
    isArray: (name) => arrayTags.includes(name),
  });
  return parser.parse(xml) as T;
}
