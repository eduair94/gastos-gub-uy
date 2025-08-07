export interface IFileService {
  findJsonFiles(directory: string): string[];
  readJsonFile<T>(filePath: string): T;
}

export class FileService implements IFileService {
  private fs = require("fs");
  private path = require("path");

  findJsonFiles(directory: string): string[] {
    let results: string[] = [];
    const list = this.fs.readdirSync(directory);

    list.forEach((file: string) => {
      const filePath = this.path.join(directory, file);
      const stat = this.fs.statSync(filePath);

      if (stat && stat.isDirectory()) {
        results = results.concat(this.findJsonFiles(filePath));
      } else if (file.endsWith(".json")) {
        results.push(filePath);
      }
    });

    return results;
  }

  readJsonFile<T>(filePath: string): T {
    const content = this.fs.readFileSync(filePath, "utf8");
    return JSON.parse(content) as T;
  }
}
