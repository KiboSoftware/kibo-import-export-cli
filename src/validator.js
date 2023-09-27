import fetch from 'node-fetch';
import { SingleBar, Presets } from 'cli-progress';
import fs from 'fs';
import path from 'path';

import { parse } from 'csv-parse';

import CatalogFetcher from './catalog-fetcher.js';

class Validator {
  constructor(catalogFetch, directory) {
    this.catalogFetch = catalogFetch || new CatalogFetcher();
    this.attibures = null;
    this.directory = path.resolve(directory || '.');
    this.fileMap = {
      'producttypeattributes.csv': this.validateproductTypeAttributes,
    };
  }

  getAttributes = async (catalogId) => {
    if (this.attibures) {
      return this.attibures;
    }
    const attributes = {};
    const tenant = await this.catalogFetch.getTenant();
    for (const mc of tenant.masterCatalogs) {
      this.catalogFetch.setMasterCatalog(mc.id);
      attributes[mc.id] = await this.catalogFetch.getAllAttributes();
      attributes[mc.name.toLowerCase()] = attributes[mc.id];
    }
    return (this.attibures = attributes);
  };

  async validateAccountSettings() {
    return await this.catalogFetch.validateAccountSettings();
  }
  getFileNameInDirectory(fileName) {
    const files = fs.readdirSync(this.directory);
    const matchingFile = files.find(
      (file) => file.toLowerCase() === fileName.toLowerCase(),
    );
    return matchingFile ? path.join(this.directory, matchingFile) : null;
  }

  async validateAll() {
    for (const file in this.fileMap) {
      if (this.getFileNameInDirectory(file)) {
        console.log(`validating file ${file}`);
        await this.fileMap[file].call(this);
      }
    }
  }
  async validateproductTypeAttributes() {
    const records = [];
    const attributes = await this.getAttributes();
    const file = this.getFileNameInDirectory('productTypeAttributes.csv');
    if (!file) {
      throw new Error('productTypeAttributes.csv file not found');
    }
    const parser = fs.createReadStream(file).pipe(
      parse({
        info: true,
        columns: (header) =>
          header.map((column) => column.trim().toLowerCase()),
        raw: true,
      }),
    );
    let report = [];
    for await (const entry of parser) {
      
      const mcName = entry.record['mastercatalogname']?.toLowerCase();
      const mcId =
        entry.record['mastercatalog'] || entry.record['mastercatalog'] || '';
      const attributeCode = entry.record['attributecode'];
      if (!attributeCode) {
        let message = `Line: ${entry.info.lines} Attribute code is empty`;
        console.error(message);
        throw new Error(message);
      }
      const attribute = (attributes[mcId] || attributes[mcName])?.find(
        (attr) =>
          attr.attributeCode?.toLowerCase() === attributeCode.toLowerCase() ||
          attr.attributeFQN.toLowerCase() === attributeCode.toLowerCase(),
      );

      if (attribute == null) {
        let message = `Line: ${entry.info.lines} Attribute ${attributeCode} not found in master catalog ${mcName} ${mcId}`;
        report.push(message);
        console.error(message);
        return false;
      }
    }
    if (report.length > 0) {
      throw new Error(`file ${file} is not valid`);
    }
    console.log(`file ${file} is valid`);
  }
}

export default Validator;
