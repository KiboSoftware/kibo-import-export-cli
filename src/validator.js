import fetch from 'node-fetch';
import { SingleBar, Presets } from 'cli-progress';
import fs from 'fs';
import path from 'path';

import { parse } from 'csv-parse';

import CatalogFetcher from './catalog-fetcher.js';
import Joi from 'joi';

class Validator {
  static responseFields = {
    attribues:{
      default: 'items(attributeCode,attributeFQN,isOption,isExtra,isProperty,inputType,dataType,valueType)'
    }
  }
  constructor(catalogFetch, directory) {
    this.report = [];
    this.catalogFetch = catalogFetch || new CatalogFetcher();

    this.state = {
      attibures: {},
      productTypes: {},
    };
    this.stateFile = '.cache/state.json';

    this.directory = path.resolve(directory || '.');
    this.fileMap = {
      'attributes.csv': this.validateAttributes,
      'attributevalues.csv': this.validateAttributeValues,
      'producttypes.csv': this.validateProductTypes,
      'producttypeattributes.csv': this.validateproductTypeAttributes,
      'producttypeattributevalues.csv': this.validateProductTypeAttributeValues,
      'products.csv': this.validateProducts,
    };
  }
  loadState() {
    //check if folder cache exists

    if (fs.existsSync(this.stateFile)) {
      this.state = JSON.parse(fs.readFileSync(this.stateFile));
      this.catalogFetch.state = this.state;
    }
  }
  saveState() {
    
    if (!fs.existsSync(path.dirname(this.stateFile))) {
      fs.mkdirSync(path.dirname(this.stateFile));
    }
    fs.writeFileSync(this.stateFile, JSON.stringify(this.state));
  }
  logError({ file, line, message }) {
    let cnt = `file: ${file} line:${line} ${message}`;
    console.error(cnt);
    this.report.push(cnt);
  }
  logInfo({ file, line, message }) {
    file = path.basename(file);
    let cnt = line > -1 ? `file: ${file} line: ${line} message: ${message}`: `file: ${file}   message: ${message}`
    console.log(cnt);
    this.report.push(cnt);
  }

  getAttributes = async ({ responseFields }) => {
    this.state.attributes = this.state.attributes || {};
    if (this.state.attributes[responseFields || 'default']) {
      return this.state.attributes[responseFields || 'default'];
    }
    const attributes = {};
    const tenant = await this.catalogFetch.getTenant();
    for (const mc of tenant.masterCatalogs) {
      this.catalogFetch.setMasterCatalog(mc.id);
      attributes[mc.id] = await this.catalogFetch.getAllAttributes({
        responseFields,
      });
    }
    return (this.state.attributes[responseFields || 'default'] = attributes);
  };

  getAttributeValues = async ({ responseFields }) => {
    this.state.attributeValues = this.state.attributeValues || {};
    if (this.state.attributeValues[responseFields || 'default']) {
      return this.state.attributeValues[responseFields || 'default'];
    }

    const attributeHeaders = await this.getAttributes({
      responseFields:  Validator.responseFields.attribues.default        
    });

    const attributeValues = {};
    const tenant = await this.catalogFetch.getTenant();
    for (const mc of tenant.masterCatalogs) {
      this.catalogFetch.setMasterCatalog(mc.id);
      const codes = attributeHeaders[mc.id]
        .filter((x) => {
          return (
            x.valueType?.toLowerCase() == 'predefined' ||
            x.dataType?.toLowerCase() === 'string'
          );
        })
        .map((x) => x.attributeFQN);
      attributeValues[mc.id] = await this.catalogFetch.getAllAttributeValues({
        codes,
        responseFields,
      });
    }
    return (this.state.attributeValues[responseFields || 'default'] =
      attributeValues);
  };

  getAttributeMap = async () => {
    const attributes = await this.getAttributes({
      responseFields: Validator.responseFields.attribues.default        
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
  getAttributeValuesMap = async () => {
    const attributes = await this.getAttributeValues({});

    const attributeMap = {};

    for (const [key, value] of Object.entries(attributes)) {
      attributeMap[key] = {};
      for (const [attKey, attValue] of Object.entries(value)) {
        attributeMap[key][attKey] = attValue.flatMap((x) => {
          return [
            x.content?.stringValue?.toLowerCase(),
            x.value?.toString()?.toLowerCase(),
          ];
        });
      }
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

  async validateFiles({ files }) {
    let flag = false;

    files = typeof files === 'string' ? [files] : files;
    for (let file of files) {
      file = file.toLowerCase();
      if (this.getFileNameInDirectory(file)) {
        flag = true;
        console.log(`validating file ${file}`);
        let result = await this.fileMap[file].call(this);
        if (result === false) {
          return false;
          // process.exit(-1);
        }
      }
    }
    if (!flag) {
      this.logError({ message: 'No files found to validate' });
    }
  }

  async validateAll() {
    let flag = false;
    for (const file in this.fileMap) {
      if (this.getFileNameInDirectory(file)) {
        flag = true;
        console.log(`validating file ${file}`);
        let result = await this.fileMap[file].call(this);
        if (result === false) {
          return false;
          // process.exit(-1);
        }
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
    const parser = fs.createReadStream(file).pipe(
      parse({
        info: true,
        columns: (header) =>
          header.map((column) => column.trim().toLowerCase()),
        raw: true,
      }),
    );
    return { parser, file };
  }

  toStringSetValidator(values, required = true) {
    let joyKey = Joi.string()
      .lowercase()
      .valid(...values);
    if (required) {
      joyKey = joyKey.required();
    }
    return joyKey;
  }
  toDependandStringSetValidator(
    mapping,
    depends = 'mastercatalog',
    required = true,
  ) {
    let joyKey = Joi.when(depends, {
      switch: Object.entries(mapping).map(([key, values]) => ({
        is: Number(key),
        then: Joi.string()
          .lowercase()
          .valid(...values),
      })),
    });
    if (required) {
      joyKey = joyKey.required();
    }
    return joyKey;
  }
  booleanValidator(required = true) {
    let val = Joi.string().lowercase().valid('true', 'false', 'yes', 'no');
    if (required) {
      return val.required();
    }
    return val.allow('');
  }

  async validate({ tenant, file, parser, schema }) {
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
    return true;
  }
  async validateAttributeValues() {
    const { parser, file } = this.getParser('attributevalues.csv');
    if (!parser) {
      return false;
    }

    const tenant = await this.catalogFetch.getTenant();
    const attributes = await this.getAttributeMap();
    const attributeCodeSchema = this.toDependandStringSetValidator(attributes);
    const namespaceSchema = Joi.string().required();
    const dataTypeSchema = Joi.string()
      .required()
      .lowercase()
      .valid('string', 'number', 'bool', 'datetime', 'productcode');
    const displayOrderSchmea = Joi.number();
    const valueSchema = Joi.string().required();

    const requiredName = Joi.string().required();

    const nameSchema = Joi.custom((value, helpers) => {
      let record = helpers.state.ancestors;
      let dataType = record[0].datatype?.toLowerCase();
      if (dataType == 'string') {
        let ret = requiredName.validate(value);
        if (ret.error) {
          return helpers.error(ret.error.message);
        }
      }
      return value;
    });
    const schema = Joi.object({
      mastercatalog: Joi.number().integer().required(),
      attributecode: attributeCodeSchema,
      datatype: dataTypeSchema,
      namespace: namespaceSchema,
      value: valueSchema,
      name: nameSchema,
      displayorder: displayOrderSchmea,
    }).unknown(true);

    return await this.validate({ tenant, file, parser, schema });
  }

  async validateAttributes() {
    //MasterCatalogName,AttributeCode,AttributeAdminName,AttributeName,Description,DataType,InputType,IsExtra,IsOption,IsProperty,Namespace,SearchableInStorefront,SearchableInAdmin,SearchDisplayValue,AvailableForOrderRouting
    const { parser, file } = this.getParser('attributes.csv');
    if (!parser) {
      return false;
    }
    const tenant = await this.catalogFetch.getTenant();
    const attributes = await this.getAttributeMap();
    const attributeCodeSchema = this.toDependandStringSetValidator(attributes);
    const attributeAdminNameSchema = Joi.string().required();
    const attributeNameSchema = Joi.string().required();
    const descriptionSchema = Joi.string().allow('');
    const dataTypeSchema = Joi.string()
      .required()
      .lowercase()
      .valid('string', 'number', 'bool', 'datetime', 'productcode');
    const inputTypeSchema = Joi.string()
      .required()
      .lowercase()
      .valid('list', 'textbox', 'yesno', 'textarea', 'datetime', 'date');
    const isExtraSchema = this.booleanValidator();
    const isOptionSchema = this.booleanValidator();
    const isPropertySchema = this.booleanValidator();
    const namespaceSchema = Joi.string().required();
    const searchableInStorefrontSchema = this.booleanValidator();
    const searchableInAdminSchema = this.booleanValidator();
    const searchDisplayValueSchema = Joi.string().required();
    const availableForOrderRoutingSchema = this.booleanValidator();
    const schema = Joi.object({
      mastercatalog: Joi.number().integer().required(),
      attributecode: attributeCodeSchema,
      attributeadminname: attributeAdminNameSchema,
      attributename: attributeNameSchema,
      description: descriptionSchema,
      datatype: dataTypeSchema,
      inputtype: inputTypeSchema,
      isextra: isExtraSchema,
      isoption: isOptionSchema,
      isproperty: isPropertySchema,
      namespace: namespaceSchema,
      searchableinstorefront: searchableInStorefrontSchema,
      searchableinadmin: searchableInAdminSchema,
      searchdisplayvalue: searchDisplayValueSchema,
      availablefororderrouting: availableForOrderRoutingSchema,
    }).unknown(true);

    return await this.validate({ tenant, file, parser, schema });
  }
  async validateProductTypeAttributeValues() {
    const { parser, file } = this.getParser('productTypeAttributeValues.csv');
    if (!parser) {
      return false;
    }

    //MasterCatalogName,ProductType,AttributeCode,Type,VocabularyValue

    const attributes = await this.getAttributeMap();
    const attributeValues = await this.getAttributeValuesMap();
    const productTypes = await this.getProducTypeMap();
    const attributeCodeSchema = this.toDependandStringSetValidator(attributes);
    const productTypeSchema = this.toDependandStringSetValidator(productTypes);
    const propAttributes = await this.getAttributes({
      responseFields: Validator.responseFields.attribues.default
    });
    const typeSchema = Joi.string()
      .required()
      .lowercase()
      .custom((value, helpers) => {
        let record = helpers.state.ancestors;
        let mc = record[0].mastercatalog;
        let att = propAttributes[mc].find(
          (att) =>
            att.attributeCode.toLowerCase() ===
            record[0].attributecode.toLowerCase(),
        );
        if (att != null) {
          switch (value) {
            case 'property':
              if (!att.isProperty) {
                return helpers.message('attribute doesnt support isProperty');
              }
              break;
            case 'option':
              if (!att.isOption) {
                return helpers.message('attribute doesnt support isOption');
              }
              break;
            case 'extra':
              if (!att.isExtra) {
                return helpers.message('attribute doesnt support isExtra');
              }
              break;
            case 'variantproperty':
              if (!att.isProperty) {
                return helpers.message('attribute doesnt support isProperty');
              }
              break;
            default:
              return helpers.message('invalid type');
          }
        }
        return value;
      });

    const vocabValueSchema = Joi.string()
      .required()
      .lowercase()
      .custom((value, helpers) => {
        let record = helpers.state.ancestors;
        let mc = record[0].mastercatalog;
        let att = propAttributes[mc].find(
          (att) =>
            att.attributeCode.toLowerCase() ===
            record[0].attributecode.toLowerCase(),
        );
        if (att.valueType?.toLowerCase() ==  'predefined' && att.dataType?.toLowerCase() == 'string'){
          let values = attributeValues[mc][att.attributeFQN.toLowerCase()];
          
          if (values.indexOf(value?.toLowerCase())==-1){
            return helpers.message('in valid value ' + value);
          }
        }
        
        return value;
      });
    //fart
    //MasterCatalogName,ProductType,AttributeCode,Type,VocabularyValue

    const schema = Joi.object({
      mastercatalog: Joi.number().integer().required(),
      producttype: productTypeSchema,
      attributecode: attributeCodeSchema,
      type: typeSchema,
      vocabularyvalue: vocabValueSchema,
    }).unknown(true);

    const tenant = await this.catalogFetch.getTenant();

    return await this.validate({ tenant, file, parser, schema });
  }

  async validateProducts() {
    const { parser, file } = this.getParser('products.csv');
    if (!parser) {
      return false;
    }

    /*
   mastercatalogname,productcode,producttype,productusage,manufacturerpartnumber,upc,distributorpartnumber,istaxable,managestock,ships by itself,outofstockbehavior,packageweight,packageweightunitid,packagelength,packagelengthunitid,packagewidth,packagewidthunitid,packageheight,packageheightunitid,fulfillmenttypes,restrictdiscount,restrictdiscountstartdate,restrictdiscountenddate,variationpricingmethod,price,saleprice,cost,msrp,map,mapeffectivestartdate,mapeffectiveenddate,productname,productshortdescription,contentfullproductdescription,seometatagtitle,seometatagdescription,seometatagkeywords,seofriendlyurl,availability,brand,bundle-extras-in-cart,color,color-filter,isrecommended,jacket-fit,last-call,length-cm,material,mvaa,popularity,product-crosssell,product-related,product-subs,product-upsell,rating,size,variant-prop,variant-tags,video-url
   */

    const attributes = await this.getAttributeMap();
    const productTypes = await this.getProducTypeMap();
    const attributeCodeSchema = this.toDependandStringSetValidator(attributes);
    const productTypeSchema = this.toDependandStringSetValidator(productTypes);
    const propAttributes = await this.getAttributes({
      responseFields:Validator.responseFields.attribues.default
    });
    const productUsageSchema = Joi.string()
      .lowercase()
      .valid('configurable', 'standard', 'bundle');

    //fart
    //MasterCatalogName,ProductType,AttributeCode,Type,VocabularyValue

    const schema = Joi.object({
      mastercatalog: Joi.number().integer().required(),
      productcode: Joi.string().min(3).max(50),
      producttype: productTypeSchema,
      productusage: productUsageSchema,
    }).unknown(true);

    const tenant = await this.catalogFetch.getTenant();

    return await this.validate({ tenant, file, parser, schema });
  }

  async validateProductTypes() {
    //MasterCatalogName,ProductType,Standard,Configurable,Bundle,Component,Collection,GoodsType

    const tenant = await this.catalogFetch.getTenant();

    const { parser, file } = this.getParser('productTypes.csv');
    if (!parser) {
      return false;
    }

    const productTypeSchema = Joi.string().required().min(3).max(30);
    const goodsTypeSchema = Joi.string()
      .lowercase()
      .valid('digital', 'physical');
    const booleanValidator = this.booleanValidator();
    const schema = Joi.object({
      mastercatalog: Joi.number().integer().required(),
      producttype: productTypeSchema,
      standard: booleanValidator,
      configurable: booleanValidator,
      bundle: booleanValidator,
      component: booleanValidator,
      collection: booleanValidator,
      goodstype: goodsTypeSchema,
    }).unknown(true);

    return await this.validate({ tenant, file, parser, schema });
  }

  async validateproductTypeAttributes() {
    const tenant = await this.catalogFetch.getTenant();

    const propAttributes = await this.getAttributes({
      responseFields:Validator.responseFields.attribues.default
    });
    const attributes = await this.getAttributeMap();
    const productTypes = await this.getProducTypeMap();
    const { parser, file } = this.getParser('productTypeAttributes.csv');
    if (!parser) {
      return false;
    }

    const productTypeSchema = this.toDependandStringSetValidator(productTypes);
    const attributeCodeSchema = this.toDependandStringSetValidator(attributes);
    const typeSchema = Joi.string()
      .required()
      .lowercase()
      .custom((value, helpers) => {
        let record = helpers.state.ancestors;
        let mc = record[0].mastercatalog;
        let att = propAttributes[mc].find(
          (att) =>
            att.attributeCode.toLowerCase() ===
            record[0].attributecode.toLowerCase(),
        );
        if (att != null) {
          switch (value) {
            case 'property':
              if (!att.isProperty) {
                return helpers.message('attribute doesnt support isProperty');
              }
              break;
            case 'option':
              if (!att.isOption) {
                return helpers.message('attribute doesnt support isOption');
              }
              break;
            case 'extra':
              if (!att.isExtra) {
                return helpers.message('attribute doesnt support isExtra');
              }
              break;
            case 'variantproperty':
              if (!att.isProperty) {
                return helpers.message('attribute doesnt support isProperty');
              }
              break;
            default:
              return helpers.message('invalid type');
          }
        }
        return value;
      });

    const schema = Joi.object({
      mastercatalog: Joi.number().integer().required(),
      producttype: productTypeSchema,
      attributecode: attributeCodeSchema,
      type: typeSchema,
    }).unknown(true);

    return await this.validate({ tenant, file, parser, schema });
  }
}

export default Validator;
