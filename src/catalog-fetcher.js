import fetch from 'node-fetch';
import { SingleBar, Presets } from 'cli-progress';
import fs from 'fs';
import path from 'path';


class CatalogFetcher {
  constructor(
    apiRoot,
    clientId,
    clientSecret
 
  ) {
    this.state ={
      tenants:{}
    }
    this.apiRoot = apiRoot;
    this.clientId = clientId;
    this.clientSecret = clientSecret;  
    this.tenantId = apiRoot.match(/https:\/\/t(\d+)/)[1]; 
    this.headers = {
      'Content-Type': 'application/json',
      accept: 'application/json',
    };

    
  }

  setCatalog( catalogId){
    this.headers['x-vol-catalog'] = catalogId;
    return this;
  }

  setMasterCatalog( catalogId){
    this.headers['x-vol-master-catalog'] = catalogId;
    return this;
  }
  async initAuth( ){
    let ticket = await this.postOAuth();
    this.headers.Authorization = `Bearer ${ticket}`;
    return this;
  }

  async postOAuth() {
    const ticket = this.state.ticket;
    if (ticket && ticket.expiresAt > Date.now()) {
      return ticket.access_token;
    }
    const data = {
      client_id: this.clientId,
      client_secret: this.clientSecret,
    };
    const response = await fetch(
      `${this.apiRoot}/platform/applications/authtickets/oauth`,
      {
        method: 'POST',
        headers: this.headers,
        body: JSON.stringify(data),
      },
    );
    if (response.status > 300) {
      let message = `Failed to get OAuth ticket - ${response.status} - ${response.statusText}`;

      console.log(message);
      if (response.headers.get('Content-Type').indexOf('json') > -1) {
        const result = await response.json();
        console.log(result);
      }
      throw new Error(message);
    }
    const result = await response.json();
    this.state.ticket = result;
    this.state.ticket.expiresAt = Date.now() + result.expires_in * 1000;
    return result.access_token;
  }

  async getCategories(startIndex, pageSize) {
    const response = await fetch(
      `${this.apiRoot}/commerce/catalog/admin/categories?startIndex=${startIndex}&pageSize=${pageSize}?responseFields=items(code,id)`,
      {
        method: 'GET',
        headers: this.headers,
      },
    );
    const data = await response.json();
    return data;
  }

  async getProductTypes(startIndex, pageSize,{responseFields} ) {
    const response = await fetch(
      `${this.apiRoot}/commerce/catalog/admin/attributedefinition/producttypes?startIndex=${startIndex}&pageSize=${pageSize}&responseFields=${responseFields}`,
      {
        method: 'GET',
        headers: this.headers,
      },
    );
    const data = await response.json();
    return data;
  }

  async getAttributes(startIndex, pageSize,{responseFields} ) {
    const response = await fetch(
      `${this.apiRoot}/commerce/catalog/admin/attributedefinition/attributes?startIndex=${startIndex}&pageSize=${pageSize}&responseFields=${responseFields}`,
      {
        method: 'GET',
        headers: this.headers,
      },
    );
    const data = await response.json();
    return data;
  }

  async getProducts(startIndex, pageSize, lastSequence) {
    let url = `${this.apiRoot}/commerce/catalog/admin/products`;
    if (lastSequence) {
      url = `${url}?pageSize=${pageSize}&sortby=productSequence asc&filter=productSequence gt ${lastSequence}`;
    } else {
      url = `${url}?startIndex=${startIndex}&pageSize=${pageSize}&sortby=productSequence asc`;
    }
    const response = await fetch(url, {
      method: 'GET',
      headers: this.headers,
    });
    const data = await response.json();
    return data;
  }


  async getAllProductTypes({responseFields }) {
    console.log(`getting all ProductTypes [${this.headers['x-vol-master-catalog']}]`);
    let items = [];
    let startIndex = 0;
    let pageCount = 1;
    const pageSize = 200;
    const progressBar = new SingleBar({}, Presets.shades_classic);
    while (startIndex < pageCount * pageSize) {
      const data = await this.getProductTypes(startIndex, pageSize, {responseFields });
      if (startIndex == 0) {
        progressBar.start(data.totalCount, 0);
      }
      items = items.concat(data.items);
      pageCount = data.pageCount;
      progressBar.update(startIndex + data.items?.length);
      startIndex += pageSize;
    }
    
    progressBar.stop();
    return items;
  }

  async getAllAttributes({responseFields }) {
    console.log(`getting all Attributes [${this.headers['x-vol-master-catalog']}]`);
    let items = [];
    let startIndex = 0;
    let pageCount = 1;
    const pageSize = 200;
    const progressBar = new SingleBar({}, Presets.shades_classic);
    while (startIndex < pageCount * pageSize) {
      const data = await this.getAttributes(startIndex, pageSize, {responseFields });
      if (startIndex == 0) {
        progressBar.start(data.totalCount, 0);
      }
      items = items.concat(data.items);
      pageCount = data.pageCount;
      progressBar.update(startIndex + data.items?.length);
      startIndex += pageSize;
    }
    
    progressBar.stop();
    return items;
  }


  async getAllCategories() {
    console.log(`getting all Categories [${this.headers['x-vol-catalog']}]`);
    let categories = [];
    let startIndex = 0;
    let pageCount = 1;
    const pageSize = 200;
    const progressBar = new SingleBar({}, Presets.shades_classic);
    while (startIndex < pageCount * pageSize) {
      const data = await this.getCategories(startIndex, pageSize);
      if (startIndex == 0) {
        progressBar.start(data.totalCount, 0);
      }
      categories = categories.concat(data.items);
      pageCount = data.pageCount;
      progressBar.update(startIndex + data.items?.length);
      startIndex += pageSize;
    }
    this.sortCategories(categories);
    progressBar.stop();
    return categories;
  }
  async getTenant(tenantId) {
    tenantId = tenantId || this.tenantId;
    this.state.tenants = this.state.tenants ||{};
    let tenant = this.state.tenants[tenantId];
    if (tenant) {
      return tenant;
    }
    this.headers.Authorization = `Bearer ${await this.postOAuth()}`;
    const response = await fetch(
      `${this.apiRoot}/platform/tenants/${tenantId}`,
      {
        method: 'GET',
        headers: this.headers,
      },
    );
    if (response.status > 399) {
      if (response.headers.get('Content-Type')?.indexOf('json') > -1) {
        const result = await response.json();
        console.log(result);
        throw new Error(result.message);
      }
      throw new Error(response.statusText);
    }
    tenant = await response.json();
    tenant.maps ={};
    tenant.maps.masterCatalgByName = {};
    for ( const mc of tenant.masterCatalogs){
      tenant.maps.masterCatalgByName [mc.name.toLowerCase()] = mc;
    }
    this.state.tenants[tenantId] = tenant;
    return this.state.tenants[tenantId];
  }

  async getSetting(settingName) {
    let route = this.generalSettingRoutes[settingName];
    const response = await fetch(`${this.apiRoot}${route}`, {
      method: 'GET',
      headers: this.headers,
    });
    if (response.status !== 200) {
      console.log(
        `Failed to get ${settingName} - site:${this.headers['x-vol-site']} -  ${response.statusText}`,
      );
    } else {
      return await response.json();
    }
  }
  async saveSetting(settingName, setting) {
    let route = this.generalSettingRoutes[settingName];
    const response = await fetch(`${this.apiRoot}${route}`, {
      method: 'PUT',
      headers: this.headers,
      body: JSON.stringify(setting),
    });
    if (response.status !== 200) {
      console.log(
        `Failed to save ${settingName} - site:${this.headers['x-vol-site']}  - ${response.statusText}`,
      );
    } else {
      return await response.json();
    }
  }

  async saveCategory(categoryId, category) {
    const response = await fetch(
      `${this.apiRoot}/commerce/catalog/admin/categories/${categoryId}`,
      {
        method: 'PUT',
        headers: this.headers,
        body: JSON.stringify(category),
      },
    );
    if (response.status !== 200) {
      console.log(
        `Failed to save category ${categoryId} - ${response.statusText}`,
      );
    }
    const result = await response.json();
    return result;
  }
  async saveProduct(product) {
    const response = await fetch(
      `${this.apiRoot}/commerce/catalog/admin/products/${product.productCode}?sort=productSequence asc`,
      {
        method: 'PUT',
        headers: this.headers,
        body: JSON.stringify(product),
      },
    );
    if (response.status !== 200) {
      if (response.headers.get('Content-Type')?.indexOf('json') > -1) {
        const result = await response.json();
        console.log(result);
      }
      console.log(
        `Failed to save Product ${product.productCode} - ${response.statusText}`,
      );
      return;
    }

    const result = await response.json();
    return result;
  }
  async deleteCategory(categoryId) {
    const response = await fetch(
      `${this.apiRoot}/commerce/catalog/admin/categories/${categoryId}`,
      {
        method: 'DELETE',
        headers: this.headers,
      },
    );
    if (response.status !== 200) {
      console.log(
        `Failed to delete category ${categoryId} - ${response.statusText}`,
      );
    }
    return;
  }
  async createCategory(category) {
    const response = await fetch(
      `${this.apiRoot}/commerce/catalog/admin/categories/`,
      {
        method: 'POST',
        headers: this.headers,
        body: JSON.stringify(category),
      },
    );
    if (response.status !== 201) {
      console.log(
        `Failed to save category ${category.categoryCode} - ${response.statusText}`,
      );
    }
    const result = await response.json();
    return result;
  }

  async getEntityLists() {
    const response = await fetch(
      `${this.apiRoot}/platform/entitylists?pagesize=200`,
      {
        method: 'GET',
        headers: this.headers,
      },
    );
    const result = await response.json();
    return result;
  }
  async getEntities(entityListId, startIndex) {
    startIndex = startIndex || 0;
    const response = await fetch(
      `${this.apiRoot}/platform/entitylists/${entityListId}/entities?pagesize=200&startIndex=${startIndex}`,
      {
        method: 'GET',
        headers: this.headers,
      },
    );
    const result = await response.json();
    return result;
  }

  async saveEntity(entityListId, entity) {
    let response = await fetch(
      `${this.apiRoot}/platform/entitylists/${entityListId}/entities/${entity.id}`,
      {
        method: 'PUT',
        headers: this.headers,
        body: JSON.stringify(entity),
      },
    );
    if (response.status > 299) {
      response = await fetch(
        `${this.apiRoot}/platform/entitylists/${entityListId}/entities`,
        {
          method: 'POST',
          headers: this.headers,
          body: JSON.stringify(entity),
        },
      );
    }
    if (response.status !== 200) {
      console.log(
        `Failed to save entity ${entity.id} - ${response.statusText}`,
      );
    }
    const result = await response.json();
    return result;
  }

  async getSearchRedirects() {
    //todo: get all pages
    const response = await fetch(
      `${this.apiRoot}/commerce/catalog/admin/search/redirect?pagesize=200`,
      {
        method: 'GET',
        headers: this.headers,
      },
    );
    const result = await response.json();
    return result;
  }

  async saveSearchRedirects(item) {
    let response = await fetch(
      `${this.apiRoot}/commerce/catalog/admin/search/redirect/${item.redirectId}`,
      {
        method: 'PUT',
        headers: this.headers,
        body: JSON.stringify(item),
      },
    );
    if (response.status > 299) {
      response = await fetch(
        `${this.apiRoot}/commerce/catalog/admin/search/redirect`,
        {
          method: 'POST',
          headers: this.headers,
          body: JSON.stringify(item),
        },
      );
    }
    if (response.status > 299) {
      console.log(
        `Failed to save SearchMerchandizingRules ${item.code} - ${response.statusText}`,
      );
    }
    const result = await response.json();
    return result;
  }

  async getSearchMerchandizingRules() {
    //todo: get all pages
    const response = await fetch(
      `${this.apiRoot}/commerce/catalog/admin/searchmerchandizingrules?pagesize=200`,
      {
        method: 'GET',
        headers: this.headers,
      },
    );
    const result = await response.json();
    return result;
  }

  async saveSearchMerchandizingRules(merchRule) {
    let response = await fetch(
      `${this.apiRoot}/commerce/catalog/admin/searchmerchandizingrules/${merchRule.code}`,
      {
        method: 'PUT',
        headers: this.headers,
        body: JSON.stringify(merchRule),
      },
    );
    if (response.status > 299) {
      response = await fetch(
        `${this.apiRoot}/commerce/catalog/admin/searchmerchandizingrules`,
        {
          method: 'POST',
          headers: this.headers,
          body: JSON.stringify(merchRule),
        },
      );
    }
    if (response.status > 299) {
      console.log(
        `Failed to save SearchMerchandizingRules ${merchRule.code} - ${response.statusText}`,
      );
    }
    const result = await response.json();
    return result;
  }

  async getSearchSettings() {
    const response = await fetch(
      `${this.apiRoot}/commerce/catalog/admin/search/settings`,
      {
        method: 'GET',
        headers: this.headers,
      },
    );
    const result = await response.json();
    return result;
  }
  async saveSearchSetting(searchSetting) {
    let response = await fetch(
      `${this.apiRoot}/commerce/catalog/admin/search/settings/${searchSetting.settingsName}`,
      {
        method: 'PUT',
        headers: this.headers,
        body: JSON.stringify(searchSetting),
      },
    );
    if (response.status > 299) {
      response = await fetch(
        `${this.apiRoot}/commerce/catalog/admin/search/settings`,
        {
          method: 'POST',
          headers: this.headers,
          body: JSON.stringify(searchSetting),
        },
      );
    }
    if (response.status > 299) {
      console.log(
        `Failed to save searchSetting ${searchSetting.settingsName} - ${response.statusText}`,
      );
    }
    const result = await response.json();
    return result;
  }
  async cleanAndSaveCategories(categories) {
    for (const category of categories) {
      if (
        category.categoryCode.startsWith('KW-EN-') ||
        category.categoryCode.startsWith('KW-AR-')
      ) {
        category.categoryCode = category.categoryCode.substring(6);
        await this.saveCategory(category.id, category);
      }
    }
  }
  getUniqueCatalogIds(tenant) {
    const catalogIds = tenant.sites.map((site) => site.catalogId);
    const uniqueCatalogIds = [...new Set(catalogIds)];
    return uniqueCatalogIds;
  }
  getCatalogMap(tenant) {
    const catalogMap = {};
    tenant.masterCatalogs.forEach((masterCatalog) => {
      masterCatalog.catalogs.forEach((catalog) => {
        catalogMap[catalog.id] = catalog;
      });
    });
    return catalogMap;
  }
  async cleanCategories() {
    this.headers.Authorization = `Bearer ${await this.postOAuth()}`;
    const tenant = await this.getTenant(this.tenantId);
    const catalogIds = this.getUniqueCatalogIds(tenant);
    for (const catalogId of catalogIds) {
      this.headers['x-vol-catalog'] = catalogId;
      let startIndex = 0;
      let pageCount = 1;
      const pageSize = 200;
      while (startIndex < pageCount * pageSize) {
        const data = await this.getCategories(startIndex, pageSize);
        const categories = data.items;
        await this.cleanAndSaveCategories(categories);
        pageCount = data.pageCount;
        startIndex += pageSize;
      }
    }
  }
  sortCategories(categories) {
    function isParentOf(cat1, cat2) {
      return cat2.parentCategoryCode === cat1.categoryCode;
    }
    categories.sort((cat1, cat2) => {
      if (isParentOf(cat1, cat2)) {
        return -1;
      } else if (isParentOf(cat2, cat1)) {
        return 1;
      }
      return 0;
    });
    return categories;
  }
  sortCategoryById(categories, categoryId) {
    const matchingCategory = categories.find(
      (cat) => cat.categoryId === categoryId,
    );
    if (matchingCategory) {
      const index = categories.indexOf(matchingCategory);
      categories.splice(index, 1);
      categories.unshift(matchingCategory);
    }
    return categories;
  }
  mapCategoryIds(
    categoryMap,
    productInCatalogSource,
    productInCatalogsDestination,
  ) {
    if (productInCatalogSource == productInCatalogsDestination) {
      return;
    }
    if (
      productInCatalogSource.primaryProductCategory &&
      !(productInCatalogSource.productCategories || []).some(
        (cat) =>
          cat.categoryId ==
          productInCatalogSource.primaryProductCategory.categoryId,
      )
    ) {
      delete productInCatalogSource.primaryProductCategory;
    }

    var sourceMap = categoryMap[productInCatalogSource.catalogId];
    var destinationMap = categoryMap[productInCatalogsDestination.catalogId];

    let mappedCategories = productInCatalogSource.productCategories
      ?.map(
        (id) =>
          destinationMap.categoryCodes[
            sourceMap.ids[id.categoryId]?.categoryCode
          ]?.id,
      )
      .filter((id) => id !== null && id !== undefined)
      .map((id) => {
        return { categoryId: id };
      });

    if (
      (mappedCategories || []).length !=
      (productInCatalogsDestination.productCategories || []).length
    ) {
      productInCatalogsDestination.productCategories = mappedCategories;
    } else if (mappedCategories) {
      if (
        mappedCategories.some((mcat) => {
          return !productInCatalogsDestination.productCategories.find(
            (pcat) => pcat.categoryId == mcat.categoryId,
          );
        })
      ) {
        productInCatalogsDestination.productCategories = mappedCategories;
      }
    }

    if (!(productInCatalogsDestination.productCategories?.length > 0)) {
      delete productInCatalogsDestination.productCategories;
    }

    const primaryCategoryId =
      destinationMap.categoryCodes[
        sourceMap.ids[productInCatalogSource.primaryProductCategory?.categoryId]
          ?.categoryCode
      ]?.id;
    if (primaryCategoryId !== null && primaryCategoryId !== undefined) {
      productInCatalogsDestination.primaryProductCategory = {
        categoryId: primaryCategoryId,
      };
      if (
        !productInCatalogsDestination.productCategories?.find(
          (cat) => cat.categoryId == primaryCategoryId,
        )
      ) {
        productInCatalogsDestination.productCategories.push(
          productInCatalogsDestination.primaryProductCategory,
        );
      }
    } else {
      delete productInCatalogsDestination.primaryProductCategory;
    }
  }
  async waitForPromises(promises, count) {
    while (promises.size > count) {
      await Promise.race(promises);
    }
    return promises;
  }

  async syncProductInCatalogs() {
    this.headers.Authorization = `Bearer ${await this.postOAuth()}`;

    const progressBar = new SingleBar({}, Presets.shades_classic);
    this.headers['x-vol-master-catalog'] = this.masterCatalog;
    let tenant = await this.getTenant(this.tenantId);
    let catalogMap = this.getCatalogMap(tenant);
    let categoryMap = await this.getCategoryMap();
    let startIndex = 0;
    //let pageCount = 1;
    const pageSize = 200;
    let work = new Set();
    console.log('Syncing products in Catalog');
    delete this.headers['x-vol-catalog'];
    let lastSequence = undefined;
    let totalCount = 1;
    while (totalCount > 0) {
      this.headers.Authorization = `Bearer ${await this.postOAuth()}`;
      const data = await this.getProducts(startIndex, pageSize, lastSequence);
      totalCount = data.totalCount;
      if (startIndex == 0) {
        progressBar.start(data.totalCount, 0);
      }
      for (const product of data.items) {
        progressBar.increment();
        const beforeJson = JSON.stringify(product);
        let pic = product.productInCatalogs || [];
        let prime = pic.find((p) => p.catalogId === this.primeCatalog);
        if (!prime) {
          console.log(`Product ${product.productCode} not in prime catalog`);
          continue;
        }
        // Loop through all the catalog pairs
        for (const pair of this.catalogPairs) {
          // Find the source catalog
          let source = pic.find((p) => p.catalogId === pair.source);
          // Find the destination catalog
          let dest = pic.find((p) => p.catalogId === pair.destination);
          // If the source catalog is not found, skip to the next catalog pair
          if (!source) {
            continue;
          }
          // If the source catalog has content and the destination catalog has no content, copy the source catalog content to the destination catalog
          if (
            source.content &&
            prime.content?.productImages &&
            prime.content.productImages.length >
              source.content.productImages.length
          ) {
            source.content.productImages = prime.content?.productImages;
          }
          // If the destination catalog is not found, create a copy of the source catalog and assign it to the destination catalog
          if (!dest) {
            dest = JSON.parse(
              JSON.stringify(
                Object.assign({}, source, {
                  catalogId: pair.destination,
                  price: {
                    isoCurrencyCode:
                      catalogMap[pair.destination].defaultCurrencyCode,
                    price: 1,
                  },
                }),
              ),
            );

            pic.push(dest);
          } else {
            // If the destination catalog has content and the source catalog has more content, copy the source catalog content to the destination catalog
            if (
              dest.content &&
              prime.content?.productImages &&
              prime.content.productImages &&
              prime.content.productImages.length >
                dest.content.productImages.length
            ) {
              dest.content.productImages = prime.content?.productImages;
            }
          }
          // Map the category IDs from the prime catalog to the source and destination catalogs
          this.mapCategoryIds(categoryMap, prime, source);
          this.mapCategoryIds(categoryMap, prime, dest);
        }
        lastSequence = product.productSequence;
        if (this.productCompare(JSON.parse(beforeJson), product) != null) {
          let task = this.saveProduct(product);
          task.finally(() => work.delete(task));
          work.add(task);
          await this.waitForPromises(work, 4);
        }
      }
      //pageCount = data.pageCount;
      startIndex += pageSize;
    }
    await this.waitForPromises(work, 0);
    progressBar.stop();
    console.log('Done');
  }
  productCompare(product1, product2) {
    const sortProductInCatalogsByCatalogId = (product) => {
      product.productInCatalogs.sort((a, b) => {
        return a.catalogId - b.catalogId;
      });
    };
    sortProductInCatalogsByCatalogId(product1);
    sortProductInCatalogsByCatalogId(product2);

    return this.deepCompare(product1, product2);
  }
  deepCompare(obj1, obj2) {
    const stack = [[obj1, obj2]];
    while (stack.length > 0) {
      const [o1, o2] = stack.pop();
      if (Array.isArray(o1) && Array.isArray(o2)) {
        if (o1.length !== o2.length) {
          return [o1, o2];
        }
        const sorted1 = o1.slice().sort();
        const sorted2 = o2.slice().sort();
        for (let i = 0; i < sorted1.length; i++) {
          stack.push([sorted1[i], sorted2[i]]);
        }
      } else if (typeof o1 === 'object' && typeof o2 === 'object') {
        const keys1 = Object.keys(o1).sort();
        const keys2 = Object.keys(o2).sort();
        if (keys1.length !== keys2.length) {
          return [o1, o2];
        }
        for (let i = 0; i < keys1.length; i++) {
          if (keys1[i] !== keys2[i]) {
            return [o1, o2];
          }
          stack.push([o1[keys1[i]], o2[keys2[i]]]);
        }
      } else if (o1 !== o2) {
        return [o1, o2];
      }
    }
    return null;
  }
  async getCategoryMap() {
    console.log('getting category map');
    this.headers.Authorization = `Bearer ${await this.postOAuth()}`;
    const categoryMap = {};
    const tenant = await this.getTenant(this.tenantId);
    const catalogIds = this.getUniqueCatalogIds(tenant);
    for (const catalogId of catalogIds) {
      this.headers['x-vol-catalog'] = catalogId;
      const map = (categoryMap[catalogId] = { ids: {}, categoryCodes: {} });
      const categories = await this.getAllCategories();
      for (const category of categories) {
        map.ids[category.id] = category;
        map.categoryCodes[category.categoryCode] = category;
      }
    }
    return categoryMap;
  }

  async syncMerchandisingSettings() {
    this.headers.Authorization = `Bearer ${await this.postOAuth()}`;
    const tenant = await this.getTenant(this.tenantId);
    for (const sitePair of this.sitePairs) {
      const sourceSite = tenant.sites.find(
        (site) => site.id === sitePair.source,
      );
      const destinationSite = tenant.sites.find(
        (site) => site.id === sitePair.destination,
      );
      this.headers['x-vol-catalog'] = sourceSite.catalogId;
      this.headers['x-vol-site'] = sourceSite.id;
      let rules = await this.getSearchMerchandizingRules();
      for (const rule of rules.items) {
        this.headers['x-vol-catalog'] = destinationSite.catalogId;
        this.headers['x-vol-site'] = destinationSite.id;
        await this.saveSearchMerchandizingRules(rule);
      }
    }
    delete this.headers['x-vol-site'];
  }

  async getFacets() {
    //todo paging
    const url = `${this.apiRoot}/commerce/catalog/admin/facets?pagesize=200`;
    const response = await fetch(url, { headers: this.headers });
    if (!response.ok) {
      throw new Error(`Failed to get facets : ${response.statusText}`);
    }
    return response.json();
  }

  async saveFacet(facet) {
    let response = null;
    if (!facet.facetId) {
      response = await fetch(`${this.apiRoot}/commerce/catalog/admin/facets`, {
        method: 'POST',
        headers: this.headers,
        body: JSON.stringify(facet),
      });
    } else {
      response = await fetch(
        `${this.apiRoot}/commerce/catalog/admin/facets/${facet.facetId}`,
        {
          method: 'PUT',
          headers: this.headers,
          body: JSON.stringify(facet),
        },
      );
    }

    if (response.status > 299) {
      
      console.log(`failed to save facet ${facet.facetId}`);
    }
  }

  async getContents(filter, pagesize, startIndex) {
    const url = `${
      this.apiRoot
    }/content/documentlists/files@mozu/documents?filter=${filter}&pageSize=200&startIndex=${startIndex}&ts=${new Date().getTime()}`;
    const response = await fetch(url, { method: 'GET', headers: this.headers });
    if (!response.ok) {
      let foo = await response.json();
      throw new Error(`Failed to get contents: ${response.statusText}`);
    }
    return await response.json();
  }

  async downloadSwatches() {
    this.headers.Authorization = `Bearer ${await this.postOAuth()}`;
    this.headers['x-vol-site'] = '100166';
    const filter = 'name sw colour-swatch';
    const pageSize = 200;
    let startIndex = 0;

    const downlaod = async function (item, filePath) {
      const url = `https://cdn-tp1.euw1.kibocommerce.com/100067-100166/cms/100166/files/${item.id}`;
      const response = await fetch(url);
      if (!response.ok) {
        console.log(
          `Failed to download swatch ${item.name}: ${response.statusText}`,
        );
        return;
      }
      const buffer = await response.arrayBuffer();
      fs.writeFileSync(filePath, buffer);
      console.log(`Downloaded swatch ${item.name}`);
    };
    while (startIndex != -2) {
      const contents = await this.getContents(filter, pageSize, startIndex);
      const swatchesDir = './swatches';
      if (!fs.existsSync(swatchesDir)) {
        fs.mkdirSync(swatchesDir);
      }
      const promises = [];
      for (const item of contents.items) {
        if (fs.existsSync(path.join(swatchesDir, item.name))) {
          continue;
        }
        promises.push(downlaod(item, path.join(swatchesDir, item.name)));

        if (promises.length >= 5) {
          try {
            await Promise.all(promises);
          } catch (err) {
            console.log(err);
          }
          promises.length = 0;
        }
      }
      if (promises.length > 0) {
        await Promise.all(promises);
      }
      if (contents.length < pageSize) {
        break;
      }
      startIndex += pageSize;
    }
  }

  async uploadSwatches() {
    this.headers['x-vol-site'] = this.sitePairs[0].source;
    this.headers.Authorization = `Bearer ${await this.postOAuth()}`;
    const swatchesDir = './swatches';
    if (!fs.existsSync(swatchesDir)) {
      console.log(`Swatches directory ${swatchesDir} does not exist`);
      return;
    }
    async function upload(file, apiRoot, headers) {
      const filePath = path.join(swatchesDir, file);
      const extension = path.extname(file).replace('.', '');
      const name = path.basename(file, extension);
      const documentTypeFQN = 'image@mozu';
      const listFQN = 'files@mozu';
      const contentMimeType = 'image/webp';
      const createUrl = `${apiRoot}/content/documentlists/files@mozu/documents`;

      const createResponse = await fetch(createUrl, {
        method: 'POST',
        headers: {
          ...headers,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name,
          extension,
          documentTypeFQN,
          listFQN,
          contentMimeType,
        }),
      });
      if (createResponse.status == 409) {
        return;
      }
      if (!createResponse.ok) {
        console.log(
          `Failed to create document ${name}: ${createResponse.statusText}`,
        );
        let err = await createResponse.json();
        return;
      }
      const createData = await createResponse.json();
      const id = createData.id;
      const contentUrl = `${apiRoot}/content/documentlists/files@mozu/documents/${id}/content`;
      const contentBuffer = fs.readFileSync(filePath);
      const contentResponse = await fetch(contentUrl, {
        method: 'PUT',
        headers: {
          ...headers,
          'Content-Type': contentMimeType,
        },
        body: contentBuffer,
      });
      if (!contentResponse.ok) {
        console.log(
          `Failed to upload content for document ${name}: ${contentResponse.statusText}`,
        );
        return;
      }
      console.log(`Uploaded document ${name}`);
    }
    const files = fs.readdirSync(swatchesDir);
    const promises = [];
    for (const file of files) {
      const createPromise = upload(file, this.apiRoot, this.headers);
      promises.push(createPromise);
      if (promises.length >= 5) {
        await Promise.all(promises);
        promises.length = 0;
      }
    }
    if (promises.length > 0) {
      await Promise.all(promises);
    }
  }

  async uploadSwatches2() {
    const swatchesDir = './swatches';
    if (!fs.existsSync(swatchesDir)) {
      console.log(`Swatches directory ${swatchesDir} does not exist`);
      return;
    }
    this.headers['x-vol-site'] = this.sitePairs[0].source;
    this.headers.Authorization = `Bearer ${await this.postOAuth()}`;

    const files = fs.readdirSync(swatchesDir);
    for (const file of files) {
      const filePath = path.join(swatchesDir, file);
      const extension = path.extname(file).replace('.', '');
      const name = path.basename(file, extension);
      const documentTypeFQN = 'image@mozu';
      const listFQN = 'files@mozu';
      const contentMimeType = 'image/webp';
      const createUrl = `${this.apiRoot}/content/documentlists/files@mozu/documents`;

      const createResponse = await fetch(createUrl, {
        method: 'POST',
        headers: {
          ...this.headers,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name,
          extension,
          documentTypeFQN,
          listFQN,
          contentMimeType,
        }),
      });
      if (createResponse.status == 409) {
        continue;
      }
      if (!createResponse.ok) {
        console.log(
          `Failed to create document ${name}: ${createResponse.statusText}`,
        );
        let err = await createResponse.json();
        continue;
      }
      const createData = await createResponse.json();
      const id = createData.id;
      const contentUrl = `${this.apiRoot}/content/documentlists/files@mozu/documents/${id}/content`;
      const contentBuffer = fs.readFileSync(filePath);
      const contentResponse = await fetch(contentUrl, {
        method: 'PUT',
        headers: {
          ...this.headers,
          'Content-Type': contentMimeType,
        },
        body: contentBuffer,
      });
      if (!contentResponse.ok) {
        console.log(
          `Failed to upload content for document ${name}: ${contentResponse.statusText}`,
        );
        continue;
      }
      console.log(`Uploaded document ${name}`);
    }
  }

  async syncFacets() {
    this.headers.Authorization = `Bearer ${await this.postOAuth()}`;
    const tenant = await this.getTenant(this.tenantId);
    let categoryMap = await this.getCategoryMap();
    for (const sitePair of this.sitePairs) {
      const sourceSite = tenant.sites.find(
        (site) => site.id === sitePair.source,
      );
      const destinationSite = tenant.sites.find(
        (site) => site.id === sitePair.destination,
      );

      this.headers['x-vol-catalog'] = sourceSite.catalogId;
      this.headers['x-vol-site'] = sourceSite.id;
      const facets = await this.getFacets();

      //sort so the origional comes before the override entry
      facets.items.sort((a, b) => {
        if (a.overrideFacetId && !b.overrideFacetId) {
          return 1;
        } else if (!a.overrideFacetId && b.overrideFacetId) {
          return -1;
        } else {
          return 0;
        }
      });

      this.headers['x-vol-catalog'] = destinationSite.catalogId;
      this.headers['x-vol-site'] = destinationSite.id;

      const destFacets = await this.getFacets();
      var sourceMap = categoryMap[sourceSite.catalogId];
      var destinationMap = categoryMap[destinationSite.catalogId];
      for (const facet of facets.items) {
        if (facet.categoryId) {
          let mappedCategory =
            destinationMap.categoryCodes[
              sourceMap.ids[facet.categoryId].categoryCode
            ];

          facet.categoryCode = mappedCategory?.categoryCode;
          facet.categoryId = mappedCategory?.id;
        }

        let existing = destFacets.items.find(
          (x) =>
            x.catalogId == facet.catalogId &&
            x.source.id == facet.source.id &&
            x.source.type == facet.source.type,
        );
        if (existing) {
          facet.facetId = existing.facetId;
          continue;
        } else {
          delete facet.facetId;
        }
        await this.saveFacet(facet);
      }
    }
    delete this.headers['x-vol-site'];
  }

  async syncSerachRedirects() {
    this.headers.Authorization = `Bearer ${await this.postOAuth()}`;
    const tenant = await this.getTenant(this.tenantId);
    for (const sitePair of this.sitePairs) {
      const sourceSite = tenant.sites.find(
        (site) => site.id === sitePair.source,
      );
      const destinationSite = tenant.sites.find(
        (site) => site.id === sitePair.destination,
      );
      this.headers['x-vol-catalog'] = sourceSite.catalogId;
      this.headers['x-vol-site'] = sourceSite.id;
      let items = await this.getSearchRedirects();
      for (const item of items.items) {
        this.headers['x-vol-catalog'] = destinationSite.catalogId;
        this.headers['x-vol-site'] = destinationSite.id;
        await this.saveSearchRedirects(item);
      }
    }
    delete this.headers['x-vol-site'];
  }

  async syncSerachRedirects2(siteMappings) {
    this.headers.Authorization = `Bearer ${await this.postOAuth()}`;
    const backupApiRoot = this.apiRoot;
    //const tenant = await getTenant(tenantId);
    for (const sitePair of siteMappings) {
      const sourceSite = sitePair.source;
      const destinationSite = sitePair.destination;

      this.headers['x-vol-catalog'] = sourceSite.catalogId;
      this.headers['x-vol-site'] = sourceSite.id;
      this.apiRoot = sourceSite.apiRoot;
      let rules = await this.getSearchRedirects();
      this.apiRoot = destinationSite.apiRoot;
      this.headers['x-vol-catalog'] = destinationSite.catalogId;
      this.headers['x-vol-site'] = destinationSite.id;
      for (const item of rules.items) {
        //let txt = JSON.stringify(rule);
        //remove all instances of KW-EN- and KW-AR- in txt
        //txt = txt.replace(/KW-EN-/g, '').replace(/KW-AR-/g, '');
        //let fixedRule = JSON.parse(txt);
        await this.saveSearchRedirects(item);
      }
    }
    this.apiRoot = backupApiRoot;
    delete this.headers['x-vol-site'];
  }

  async syncMerchandisingSettings2(siteMappings) {
    this.headers.Authorization = `Bearer ${await this.postOAuth()}`;
    const backupApiRoot = this.apiRoot;
    //const tenant = await getTenant(tenantId);
    for (const sitePair of siteMappings) {
      const sourceSite = sitePair.source;
      const destinationSite = sitePair.destination;

      this.headers['x-vol-catalog'] = sourceSite.catalogId;
      this.headers['x-vol-site'] = sourceSite.id;
      this.apiRoot = sourceSite.apiRoot;
      let rules = await this.getSearchMerchandizingRules();
      this.apiRoot = destinationSite.apiRoot;
      this.headers['x-vol-catalog'] = destinationSite.catalogId;
      this.headers['x-vol-site'] = destinationSite.id;
      for (const rule of rules.items) {
        let txt = JSON.stringify(rule);
        //remove all instances of KW-EN- and KW-AR- in txt
        txt = txt.replace(/KW-EN-/g, '').replace(/KW-AR-/g, '');
        let fixedRule = JSON.parse(txt);
        await this.saveSearchMerchandizingRules(fixedRule);
      }
    }
    this.apiRoot = backupApiRoot;
    delete this.headers['x-vol-site'];
  }

  async syncSearchSettings() {
    this.headers.Authorization = `Bearer ${await this.postOAuth()}`;
    const tenant = await this.getTenant(this.tenantId);
    for (const sitePair of this.sitePairs) {
      const sourceSite = tenant.sites.find(
        (site) => site.id === sitePair.source,
      );
      const destinationSite = tenant.sites.find(
        (site) => site.id === sitePair.destination,
      );
      this.headers['x-vol-catalog'] = sourceSite.catalogId;
      this.headers['x-vol-site'] = sourceSite.id;
      let sourceSearchSettings = await this.getSearchSettings();
      let defaultSearchSetting = sourceSearchSettings.items.filter(
        (setting) => setting.isDefault === true,
      )[0];
      if (!defaultSearchSetting) {
        console.log(
          `No default search setting found for catalog ${this.catalogPair.source}`,
        );
        continue;
      }
      this.headers['x-vol-catalog'] = destinationSite.catalogId;
      this.headers['x-vol-site'] = destinationSite.id;
      await this.saveSearchSetting(defaultSearchSetting);
    }
    delete this.headers['x-vol-site'];
  }

  async syncEntities() {
    this.headers.Authorization = `Bearer ${await this.postOAuth()}`;
    const tenant = await this.getTenant(this.tenantId);
    const lists = await this.getEntityLists();

    for (const sitePair of this.sitePairs) {
      const sourceSite = tenant.sites.find(
        (site) => site.id === sitePair.source,
      );
      const destinationSite = tenant.sites.find(
        (site) => site.id === sitePair.destination,
      );

      for (const list of lists.items) {
        if (list.contextLevel.toLowerCase() != 'catalog') {
          continue;
        }
        const listFqn = list.name + '@' + list.nameSpace;
        this.headers['x-vol-catalog'] = sourceSite.catalogId;
        this.headers['x-vol-site'] = sourceSite.id;
        var entities = await this.getEntities(listFqn);
        for (const entity of entities.items) {
          this.headers['x-vol-catalog'] = destinationSite.catalogId;
          this.headers['x-vol-site'] = destinationSite.id;

          await this.saveEntity(listFqn, entity);
        }
      }
    }
    delete this.headers['x-vol-site'];
  }

  async snycSiteSettings() {
    // Set the authorization token header
    this.headers.Authorization = `Bearer ${await this.postOAuth()}`;

    // Get the tenant details
    const tenant = await this.getTenant(this.tenantId);

    // Loop through the site pairs
    for (const sitePair of this.sitePairs) {
      // Get the source site
      const sourceSite = tenant.sites.find(
        (site) => site.id === sitePair.source,
      );

      // Get the destination site
      const destinationSite = tenant.sites.find(
        (site) => site.id === sitePair.destination,
      );

      // Loop through each of the setting names
      for (const settingName in this.generalSettingRoutes) {
        // Set the source site headers
        this.headers['x-vol-catalog'] = sourceSite.catalogId;
        this.headers['x-vol-site'] = sourceSite.id;

        // Get the setting from the source site
        let sourceSetting = await this.getSetting(settingName);

        // If the setting exists, set the destination site headers
        if (sourceSetting) {
          this.headers['x-vol-catalog'] = destinationSite.catalogId;
          this.headers['x-vol-site'] = destinationSite.id;

          // Save the source setting to the destination site
          await this.saveSetting(settingName, sourceSetting);
        }
      }
    }

    // Remove the site header
    delete this.headers['x-vol-site'];
  }

  async validateAuth() {
    await this.postOAuth();
  }
  async validateAccountSettings() {
    const tenant = await this.getTenant(this.tenantId);
    // Loop through the site pairs
    if ( (tenant?.masterCatalogs||[]).length == 0) {
      console.log(`No master catalogs found for tenant ${tenant.id}`);
      throw new Error(`No master catalogs found for tenant ${tenant.id}`);
    }
    
    

    console.log(`validated config for tenant :[${tenant.id}]`);
  }
  getCatalogById(masterCatalogs, catalogId) {
    for (const masterCatalog of masterCatalogs) {
      for (const catalog of masterCatalog.catalogs) {
        if (catalog.id == catalogId) {
          return catalog;
        }
      }
    }
    return null;
  }
  async categorySync() {
    this.headers.Authorization = `Bearer ${await this.postOAuth()}`;
    for (const catalogPair of this.catalogPairs) {
      this.headers['x-vol-catalog'] = catalogPair.source;
      const sourceCategories = await this.getAllCategories();
      this.headers['x-vol-catalog'] = catalogPair.destination;
      // Get all categories from source and destination
      const destinationCategories = await this.getAllCategories();

      // Reduce source categories to a dictionary
      const sourceCategoriesDictionary = sourceCategories.reduce(
        (acc, category) => {
          acc[category.categoryCode] = category;
          return acc;
        },
        {},
      );

      // Reduce destination categories to a dictionary
      const destinationCategoriesDictionary = destinationCategories.reduce(
        (acc, category) => {
          acc[category.categoryCode] = category;
          return acc;
        },
        {},
      );
      // Get the category codes from the source and destination
      // categories.
      const sourceCategoryCodes = sourceCategories.map(
        (category) => category.categoryCode,
      );
      const destinationCategoryCodes = destinationCategories.map(
        (category) => category.categoryCode,
      );

      // Find the category codes that are missing in the destination
      // categories.
      const missingCategoryCodes = sourceCategoryCodes.filter(
        (categoryCode) => !destinationCategoryCodes.includes(categoryCode),
      );

      // Create the missing categories.
      for (const missingCategoryCode of missingCategoryCodes) {
        const newCategory = Object.assign(
          {},
          sourceCategoriesDictionary[missingCategoryCode],
        );
        delete newCategory.id;
        newCategory.parentCategoryId =
          destinationCategoriesDictionary[newCategory.parentCategoryCode]?.id;
        destinationCategoriesDictionary[newCategory.categoryCode] =
          await this.createCategory(newCategory);
      }
      // Loop through all source categories to find the corresponding destination category
      for (const sourceCategory of sourceCategories) {
        // Search for the source category in the destination categories dictionary
        // This dictionary contains all destination categories indexed by category code
        const destinationCategory =
          destinationCategoriesDictionary[sourceCategory.categoryCode];

        // If the source category is not found in the destination categories dictionary,
        // skip to the next source category
        if (!destinationCategory) {
          continue;
        }

        // If the category code of the source category is different from the category code
        // of the destination category, skip to the next source category
        if (sourceCategory.categoryCode !== destinationCategory.categoryCode) {
          continue;
        }

        // If the parent category code of the source category is different from the parent category
        // code of the destination category, update the parent category ID of the destination category
        if (
          sourceCategory.parentCategoryCode !==
          destinationCategory.parentCategoryCode
        ) {
          destinationCategory.parentCategoryId =
            destinationCategoriesDictionary[
              sourceCategory.parentCategoryCode
            ]?.id;

          // Save the changes to the destination category
          await this.saveCategory(destinationCategory.id, destinationCategory);
        }
      }
    }
  }
}

export default CatalogFetcher;

// async function main() {
//   dotenv.config();

//   const apiRoot = process.env.API_URL;
//   const clientId = process.env.CLIENT_ID;
//   const clientSecret = process.env.CLIENT_SECRET;
//   const tenantId = apiRoot.match(/https:\/\/t(\d+)/)[1];
//   const masterCatalog = parseInt(process.env.MASTER_CATALOG);
//   const primeCatalog = parseInt(process.env.PRIME_CATALOG);
//   const catalogPairs = JSON.parse(process.env.CATALOG_PAIRS);
//   const sitePairs = JSON.parse(process.env.SITE_PAIRS);
//   const catalogCloneUtil = new CatalogCloneUtil(
//     apiRoot,
//     clientId,
//     clientSecret,
//     masterCatalog,
//     primeCatalog,
//     catalogPairs,
//     sitePairs,
//     tenantId,
//   );
//   //await catalogCloneUtil.downloadSwatches();
//   await catalogCloneUtil.uploadSwatches();
// }
// main();
