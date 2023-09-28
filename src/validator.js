import fetch from 'node-fetch';
import { SingleBar, Presets } from 'cli-progress';
import fs from 'fs';
import path from 'path';

import { parse } from 'csv-parse';

import CatalogFetcher from './catalog-fetcher.js';
import Joi from 'joi';

class Validator {
  constructor(catalogFetch, directory) {
    this.report = [];
    this.catalogFetch = catalogFetch || new CatalogFetcher();
    this.state = {
      attibures: {},
      productTypes:{}
    };
    this.directory = path.resolve(directory || '.');
    this.fileMap = {
      'producttypeattributes.csv': this.validateproductTypeAttributes,
    };
  }
  logError({ file, line, message }) {
    let cnt = `file: ${file} line:${line} ${message}`;
    console.error(cnt);
    this.report.push(cnt);
  }
  logInfo({ file, line, message }) {
    let cnt = `file: ${file} line:${line} ${message}`;
    console.log(cnt);
    this.report.push(cnt);
  }

  getAttributes = async ({ responseFields }) => {
    if (this.state.attibures[responseFields || 'default']) {
      return this.state.attibures[responseFields || 'default'];
    }
    const attributes = {};
    const tenant = await this.catalogFetch.getTenant();
    for (const mc of tenant.masterCatalogs) {
      this.catalogFetch.setMasterCatalog(mc.id);
      attributes[mc.id] = await this.catalogFetch.getAllAttributes({
        responseFields,
      });
      attributes[mc.name.toLowerCase()] = attributes[mc.id];
    }
    return (this.state.attibures[responseFields || 'default'] = attributes);
  };

  getProductTypes = async ({ responseFields }) => {
    if (this.state.productTypes[responseFields || 'default']) {
      return this.state.productTypes[responseFields || 'default'];
    }
    const productTypes = {};
    const tenant = await this.catalogFetch.getTenant();
    for (const mc of tenant.masterCatalogs) {
      this.catalogFetch.setMasterCatalog(mc.id);
      productTypes[mc.id] = await this.catalogFetch.getAllProductTypes({
        responseFields,
      });
      productTypes[mc.name.toLowerCase()] = productTypes[mc.id];
    }
    return (this.state.productTypes[responseFields || 'default'] =
      productTypes);
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
    let flag = false;
    for (const file in this.fileMap) {
      if (this.getFileNameInDirectory(file)) {
        flag = true;
        console.log(`validating file ${file}`);
        await this.fileMap[file].call(this);
      }
    }
    if (!flag) {
      this.logError({ message: 'No files found to validate' });
    }
  }
  async validateproductTypeAttributes() {
    const records = [];
    const attributes = await this.getAttributes({
      responseFields: 'items(attributeCode,attributeFQN)',
    });
    const productTypes = await this.getProductTypes({
      responseFields: 'items(id,name)',
    });
    const file = this.getFileNameInDirectory('productTypeAttributes.csv');
    if (!file) {
      this.logError({
        file,
        line: 0,
        message: 'productTypeAttributes.csv file not found',
      });
      return;
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

    const schema = Joi.object()
      .keys({
        producttype: Joi.string().lowercase().required(),
        type: Joi.string()
          .lowercase()
          .valid('property', 'option', 'extra', 'variantproperty')
          .required(),
        attributecode: Joi.string()
          .regex(/^[a-zA-Z0-9-_]+$/)
          .min(3)
          .max(50)
          .required(),
      })
      .unknown(true);

    for await (const entry of parser) {
      let value = schema.validate(entry.record);
      if (value.error) {
        value.error.details.forEach((err) => {
          this.logError({ file, line: entry.info.lines, message: err.message });
        });
        return false;
      }

      const mcName = entry.record['mastercatalogname']?.toLowerCase();
      const mcId =
        entry.record['mastercatalog'] || entry.record['mastercatalog'] || '';

      const attributeCode = entry.record['attributecode'];
      const attribute = (attributes[mcId] || attributes[mcName])?.find(
        (attr) =>
          attr.attributeCode?.toLowerCase() === attributeCode.toLowerCase() ||
          attr.attributeFQN.toLowerCase() === attributeCode.toLowerCase(),
      );
      if (!attribute) {
        this.logError({
          file,
          line: entry.info.lines,
          message: `attribute ${attributeCode} not found`,
        });
        return false;
      }

      const productType = (productTypes[mcId] || productTypes[mcName])?.find(
        (pt) =>
          pt.name.toLowerCase() === entry.record['producttype'].toLowerCase(),
      );

      if (!productType) {
        this.logError({
          file,
          line: entry.info.lines,
          message: `productType ${entry.record['producttype']} not found`,
        });
        return false;
      }
    }

    this.logInfo({ file, line: -1, message: `valid` });
  }
}

export default Validator;
