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
      productTypes: {},
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
    }
    return (this.state.attibures[responseFields || 'default'] = attributes);
  };

  getAttributeMap = async () => {
    const attributes = await this.getAttributes({
      responseFields: 'items(attributeCode,attributeFQN)',
    });

    const attributeMap = {};

    for (const [key, value] of Object.entries(attributes)) {
      attributeMap[key] = value.reduce((acc, item) => {
        acc.push(
          item.attributeCode?.toLowerCase(),
          item.attributeFQN?.toLowerCase(),
        );
        return acc;
      }, []);
    }

    return attributeMap;
  };
  getProducTypeMap = async () => {
    const productTypes = await this.getProductTypes({
      responseFields: 'items(id,name)',
    });
    const productTypeMap = {};
    for (const [key, value] of Object.entries(productTypes)) {
      productTypeMap[key] = value.reduce((acc, item) => {
        acc.push(item.name?.toLowerCase());
        return acc;
      }, []);
    }
    return productTypeMap;
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

  populateCatalogIds(record, tenant) {
    const mcName = entry.record['mastercatalogname']?.toLowerCase();
    if (mcName) {
      const mc = tenant.masterCatalogs.find(
        (mc) => mc.name.toLowerCase() === mcName,
      );
      if (mc) {
        record['mastercatalog'] = mc.id;
      }
    }
    const catName = entry.record['catalogname']?.toLowerCase();
    if (catName) {
      const cat = tenant.masterCatalogs.fla.catalogs.find(
        (cat) => cat.name.toLowerCase() === catName,
      );
      if (cat) {
        record['catalog'] = cat.id;
      }
    }
    return;
    record;
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

  getParser(fileName) {
    const file = this.getFileNameInDirectory(fileName);
    if (!file) {
      this.logError({
        file,
        line: 0,
        message: `${fileName} file not found`,
      });
      return;
    }
    const parser =  fs.createReadStream(file).pipe(
      parse({
        info: true,
        columns: (header) =>
          header.map((column) => column.trim().toLowerCase()),
        raw: true,
      }),
    );
    return {parser,file};
  }

  toStringSetValidator ( values, required = true) {
    let joyKey = Joi.string()
      .lowercase()
      .valid(...values);
    if ( required){
      joyKey = joyKey.required();
    }
    return joyKey;
  }
  toDependandStringSetValidator(mapping, depends = 'mastercatalog',  required = true) {
    let joyKey = Joi.when(depends, {
      switch: Object.entries(mapping).map(([key, values]) => ({
        is: Number(key),
        then: Joi.string()
          .lowercase()
          .valid(...values),
      })),
    });
    if ( required){
      joyKey = joyKey.required();
    }
    return joyKey;

  }

  async validateproductTypeAttributes() {
    const tenant = await this.catalogFetch.getTenant();

    const attributes = await this.getAttributeMap();
    const productTypes = await this.getProducTypeMap();
    const {parser,file} = this.getParser('productTypeAttributes.csv');
    if (!parser) {
      return false;
    }

    const productTypeSchema = this.toDependandStringSetValidator(productTypes);
    const attributeCodeSchema = this.toDependandStringSetValidator(attributes);
    const typeSchema = this.toStringSetValidator( ['property', 'option', 'extra', 'variantproperty']);
    const schema = Joi.object({
      mastercatalog: Joi.number().integer().required(),
      producttype: productTypeSchema,
      attributecode: attributeCodeSchema,
      type: typeSchema,
    }).unknown(true);

    for await (const entry of parser) {
      entry.record.mastercatalog =
        entry.mastercatalog ??
        tenant.maps.masterCatalgByName[
          entry.record.mastercatalogname?.toLowerCase() || ''
        ]?.id;
      let value = schema.validate(entry.record, { debug: false });
      if (value.error) {
        value.error.details.forEach((err) => {
          this.logError({ file, line: entry.info.lines, message: err.message });
        });
        return false;
      }
    }

    this.logInfo({ file, line: -1, message: `valid` });
  }
}

export default Validator;
