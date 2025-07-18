import { getEventsClient } from '@/lib/database';
import graphqlClient from '@/lib/graphql-client';
import { COMMUNITIES_QUERY, FEATURE_INDEX_QUERY } from '@/lib/graphql/queries/sqlite';
import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import Database from 'better-sqlite3';
import fs from 'fs';
import _ from 'lodash';
import { mkdirp } from 'mkdirp';
import SqlString from 'sqlstring-sqlite';
import { createGzip } from 'zlib';
import {
  getArticles,
  getChallenges,
  getEvents,
  getOrganizations,
  getPOITypes,
  getSuperCategories,
  getTagDescriptors,
} from './database';

const SCHEMA_VERSION = '1.0.3';

const visibilities: Record<string, number> = {
  Draft: 1,
  Published: 2,
  Archived: 3,
};

const s3Client = new S3Client({
  region: process.env.AWS_REGION || 'us-east-1',
});

const sqliteBucket = process.env.AWS_BUCKET || '';

interface AreaNode {
  a: number; // organization_id
  b: {
    a?: { status: string }; // closed
    b: number; // id
    c: Array<{ a: { a: number; b: string } }>; // image_attachments
    d: string; // name
    e: { a: { coordinates: number[] } }; // centroid
    f: { a: { coordinates: number[][][] } }; // extent
    g: Array<{ a: number }>; // super_categories
    h: string; // visibility
    s: Array<{ a: string; b: number }>; // stewardships
    t: { a: number }; // size
    tags: Array<{ key: string }>;
  };
}

interface OutingNode {
  a: number; // organization_id
  b: {
    a: number; // id
    b?: { a: number; b: string }; // featured_image
    c: string; // name
    d: { a: { coordinates: number[] } }; // start
    e: { a: { coordinates: number[][][] } }; // extent
    f: Array<{ a: number }>; // super_categories
    g: string; // visibility
    s: Array<{ a: string; b: number }>; // stewardships
    closed?: { status: string };
    t?: string; // difficulty
    u?: string; // route_type
    v?: string; // display_length
    w?: { a: number }; // route length_meters
    outing_areas: Array<{ outing_id: number; area_id: number }>;
    tags: Array<{ key: string }>;
  };
}

interface PoiNode {
  a: number; // organization_id
  b: {
    a?: number; // area_id
    b?: { status: string }; // closed
    c: number; // id
    d: Array<{ a: { a: number; b: string } }>; // image_attachments
    e: string; // name
    f: { a: { type: string; coordinates: number[] | number[][] } }; // location
    g?: number; // poi_type
    h: Array<{ a: number }>; // super_categories
    i: string; // visibility
    s: Array<{ a: string; b: number }>; // stewardships
    tags: Array<{ key: string }>;
  };
}

interface TrailNode {
  a: number; // organization_id
  b: {
    a?: number; // area_id
    b?: { status: string }; // closed
    c: number; // id
    d: Array<{ a: { a: number; b: string } }>; // image_attachments
    e: string; // name
    f?: { a: { coordinates: number[] } }; // start
    g?: { coordinates: number[][][] }; // extent
    h: Array<{ a: number }>; // super_categories
    i: string; // visibility
    s: Array<{ a: string; b: number }>; // stewardships
    t?: number; // cached_length
    tags: Array<{ key: string }>;
  };
}

interface ProcessedRow {
  rowArray: string;
  superCategories: string | null;
  stewardships: string | null;
  outings?: string | null;
  tags: string | null;
}

interface CommunityQueryResult {
  communities: Array<{
    id: number;
  }>;
}

interface DatabaseQueryResult<T> {
  rows: T[];
}

interface ArticleRow {
  id: number;
  name: string;
}

interface ChallengeRow {
  id: number;
  name: string;
}

interface EventRow {
  id: number;
  name: string;
}

interface OrganizationRow {
  id: number;
  name: string;
  logo_image_id?: number;
  uploaded_file?: string;
}

interface POITypeRow {
  id: number;
  name: string;
}

interface SuperCategoryRow {
  id: number;
  name: string;
}

interface TagDescriptorRow {
  id: number;
  feature_type: number;
  key: string;
  name: string;
  category: string;
  super_category_id: number;
}

interface FeatureIndexResult {
  data: {
    a: { a: AreaNode[] };
    b: { a: OutingNode[] };
    c: { a: PoiNode[] };
    d: { a: TrailNode[] };
  };
}

async function processArea(item: AreaNode): Promise<ProcessedRow> {
  const area = item.b;
  const imageFile = area.c[0] ? area.c[0].a.b : null;
  const imageId = area.c[0] ? area.c[0].a.a : null;
  const extent = area.f.a;
  const extentLats = extent.coordinates[0].map((innerItem) => innerItem[1]);
  const extentLons = extent.coordinates[0].map((innerItem) => innerItem[0]);
  const maxLat = Math.max(...extentLats);
  const minLat = Math.min(...extentLats);
  const maxLon = Math.max(...extentLons);
  const minLon = Math.min(...extentLons);

  const row = {
    organization_id: item.a || 'null',
    id: area.b || 'null',
    closed: area.a?.status ? SqlString.escape(area.a.status) : 'null',
    image_file: SqlString.escape(imageFile) || 'null',
    image_id: imageId || 'null',
    name: SqlString.escape(area.d) || 'null',
    feature_type: 1,
    visibility: visibilities[area.h] || 1,
    area_meters: area.t?.a || 0,
  };

  const rowArray = [
    row.id,
    row.name,
    row.organization_id,
    row.image_file,
    row.image_id,
    row.feature_type,
    row.closed,
    isNaN(maxLat) ? 0.0 : parseFloat(maxLat.toFixed(6)),
    isNaN(maxLon) ? 0.0 : parseFloat(maxLon.toFixed(6)),
    isNaN(minLat) ? 0.0 : parseFloat(minLat.toFixed(6)),
    isNaN(minLon) ? 0.0 : parseFloat(minLon.toFixed(6)),
    parseFloat(area.e.a.coordinates[1].toFixed(6)),
    parseFloat(area.e.a.coordinates[0].toFixed(6)),
    row.visibility,
    row.area_meters,
  ];

  const superCategoriesString =
    area.g.length > 0 ? await Promise.all(area.g.map((i) => `(${[1, area.b, i.a].join(',')})`)) : null;
  const stewardshipsString =
    area.s.length > 0
      ? await Promise.all(area.s.map((i) => `(${[1, area.b, i.b, SqlString.escape(i.a)].join(',')})`))
      : null;
  const tagsString =
    area.tags.length > 0
      ? await Promise.all(area.tags.map((i) => `(${[1, area.b, SqlString.escape(i.key)].join(',')})`))
      : null;

  return Promise.resolve({
    rowArray: `(${rowArray.join(', ')})`,
    superCategories: superCategoriesString ? _.uniq(superCategoriesString).join(',\n') : null,
    stewardships: stewardshipsString ? _.uniq(stewardshipsString).join(',\n') : null,
    tags: tagsString ? _.uniq(tagsString).join(',\n') : null,
  });
}

async function processOuting(item: OutingNode) {
  const outing = item.b;
  const imageFile = outing.b ? outing.b.b : null;
  const imageId = outing.b ? outing.b.a : null;
  const extent = outing.e.a;
  const extentLats =
    extent && extent.coordinates && extent.coordinates.length > 0 && Array.isArray(extent.coordinates[0])
      ? extent.coordinates[0].map((item) => item[1])
      : 'null';
  const extentLons =
    extent && extent.coordinates && extent.coordinates.length > 0 && Array.isArray(extent.coordinates[0])
      ? extent.coordinates[0].map((item) => item[0])
      : 'null';
  const maxLat = extent && extentLats !== 'null' ? Math.max(...extentLats) : 'null';
  const minLat = extent && extentLats !== 'null' ? Math.min(...extentLats) : 'null';
  const maxLon = extent && extentLons !== 'null' ? Math.max(...extentLons) : 'null';
  const minLon = extent && extentLons !== 'null' ? Math.min(...extentLons) : 'null';

  const row = {
    organization_id: item.a || 'null',
    id: outing.a || 'null',
    closed: SqlString.escape(outing.closed?.status) || 'null',
    image_file: SqlString.escape(imageFile) || 'null',
    image_id: imageId || 'null',
    name: SqlString.escape(outing.c) || 'null',
    feature_type: 4,
    visibility: visibilities[outing.g] || 1,
    difficulty: outing.t ? SqlString.escape(outing.t) : 'null',
    route_type: outing.u ? SqlString.escape(outing.u) : 'null',
    display_length: outing.v ? SqlString.escape(outing.v) : 'null',
    length_meters: outing.w?.a ? parseFloat(outing.w?.a.toFixed(1)) : 0,
  };

  const rowArray = [
    row.id,
    row.name,
    row.organization_id,
    row.image_file,
    row.image_id,
    row.feature_type,
    row.visibility,
    maxLat === 'null' || isNaN(Number(maxLat)) ? 0.0 : parseFloat(Number(maxLat).toFixed(6)),
    maxLon === 'null' || isNaN(Number(maxLon)) ? 0.0 : parseFloat(Number(maxLon).toFixed(6)),
    minLat === 'null' || isNaN(Number(minLat)) ? 0.0 : parseFloat(Number(minLat).toFixed(6)),
    minLon === 'null' || isNaN(Number(minLon)) ? 0.0 : parseFloat(Number(minLon).toFixed(6)),
    outing.d.a?.coordinates[1] ? parseFloat(outing.d.a?.coordinates[1].toFixed(6)) : 'null',
    outing.d.a?.coordinates[0] ? parseFloat(outing.d.a?.coordinates[0].toFixed(6)) : 'null',
    row.closed,
    row.difficulty,
    row.route_type,
    row.display_length,
    row.length_meters,
  ];

  const innerSuperCategories =
    outing.f.length > 0 ? await Promise.all(outing.f.map((i) => `(${[4, outing.a, i.a].join(',')})`)) : null;
  const stewardships =
    outing.s.length > 0
      ? await Promise.all(outing.s.map((i) => `(${[4, outing.a, i.b, SqlString.escape(i.a)].join(',')})`))
      : null;
  const outings =
    outing.outing_areas.length > 0
      ? await Promise.all(outing.outing_areas.map((i) => `(${[1, i.area_id, i.outing_id].join(',')})`))
      : null;
  const tagsString =
    outing.tags.length > 0
      ? await Promise.all(outing.tags.map((i) => `(${[4, outing.a, SqlString.escape(i.key)].join(',')})`))
      : null;

  return Promise.resolve({
    rowArray: `(${rowArray.join(', ')})`,
    superCategories: innerSuperCategories ? _.uniq(innerSuperCategories).join(',\n') : null,
    stewardships: stewardships ? _.uniq(stewardships).join(',\n') : null,
    outings: outings ? _.uniq(outings).join(',\n') : null,
    tags: tagsString ? _.uniq(tagsString).join(',\n') : null,
  });
}

async function processPointOfInterest(item: PoiNode) {
  const poi = item.b;
  const imageId = poi.d[0] ? poi.d[0].a.a : null;
  const imageFile = poi.d[0] ? poi.d[0].a.b : null;
  const coordinates = poi.f.a.type === 'MultiPoint' ? poi.f.a.coordinates[0] : poi.f.a.coordinates;

  const row = {
    organization_id: item.a || 'null',
    id: poi.c || 'null',
    closed: SqlString.escape(poi.b?.status) || 'null',
    image_file: SqlString.escape(imageFile) || 'null',
    image_id: imageId || 'null',
    name: SqlString.escape(poi.e) || 'null',
    feature_type: 3,
    area_id: poi.a || 'null',
    lat: parseFloat((coordinates as number[])[1].toFixed(6)),
    lon: parseFloat((coordinates as number[])[0].toFixed(6)),
    poi_type: poi.g || 'null',
    visibility: visibilities[poi.i] || 1,
  };

  const rowArray = [
    row.id,
    row.name,
    row.organization_id,
    row.image_file,
    row.image_id,
    row.feature_type,
    row.closed,
    row.area_id,
    row.lat,
    row.lon,
    row.poi_type,
    row.visibility,
  ];

  const innerSuperCategories =
    poi.h.length > 0 ? await Promise.all(poi.h.map((i) => `(${[3, poi.c, i.a].join(',')})`)) : null;
  const stewardships =
    poi.s.length > 0
      ? await Promise.all(poi.s.map((i) => `(${[3, poi.c, i.b, SqlString.escape(i.a)].join(',')})`))
      : null;
  const tagsString =
    poi.tags.length > 0
      ? await Promise.all(poi.tags.map((i) => `(${[3, poi.c, SqlString.escape(i.key)].join(',')})`))
      : null;

  return Promise.resolve({
    rowArray: `(${rowArray.join(', ')})`,
    superCategories: innerSuperCategories ? _.uniq(innerSuperCategories).join(',\n') : null,
    stewardships: stewardships ? _.uniq(stewardships).join(',\n') : null,
    tags: tagsString ? _.uniq(tagsString).join(',\n') : null,
  });
}

async function processTrail(item: TrailNode) {
  const trail = item.b;
  const imageId = trail.d[0] ? trail.d[0].a.a : null;
  const imageFile = trail.d[0] ? trail.d[0].a.b : null;
  const extent = trail.g;
  let maxLat = 0.0;
  let minLat = 0.0;
  let maxLon = 0.0;
  let minLon = 0.0;

  if (extent) {
    const extentLats = extent.coordinates[0].map((innerItem) => innerItem[1]);
    const extentLons = extent.coordinates[0].map((innerItem) => innerItem[0]);
    maxLat = Math.max(...extentLats);
    minLat = Math.min(...extentLats);
    maxLon = Math.max(...extentLons);
    minLon = Math.min(...extentLons);
  }

  const row = {
    organization_id: item.a || 'null',
    id: trail.c || 'null',
    closed: SqlString.escape(trail.b?.status) || 'null',
    image_file: SqlString.escape(imageFile) || 'null',
    image_id: imageId || 'null',
    name: SqlString.escape(trail.e) || 'null',
    feature_type: 2,
    area_id: trail.a || 'null',
    visibility: visibilities[trail.i] || 1,
    length_meters: trail.t || 0,
  };

  const rowArray = [
    row.id,
    row.name,
    row.organization_id,
    row.image_file,
    row.image_id,
    row.feature_type,
    row.area_id,
    row.closed,
    isNaN(maxLat) ? 0.0 : parseFloat(maxLat.toFixed(6)),
    isNaN(maxLon) ? 0.0 : parseFloat(maxLon.toFixed(6)),
    isNaN(minLat) ? 0.0 : parseFloat(minLat.toFixed(6)),
    isNaN(minLon) ? 0.0 : parseFloat(minLon.toFixed(6)),
    trail.f?.a?.coordinates[1] ? parseFloat(trail.f.a.coordinates[1].toFixed(6)) : 'null',
    trail.f?.a?.coordinates[0] ? parseFloat(trail.f.a.coordinates[0].toFixed(6)) : 'null',
    row.visibility,
    row.length_meters,
  ];

  const innerSuperCategories =
    trail.h.length > 0 ? await Promise.all(trail.h.map((i) => `(${[2, trail.c, i.a].join(',')})`)) : null;
  const stewardships =
    trail.s.length > 0
      ? await Promise.all(trail.s.map((i) => `(${[2, trail.c, i.b, SqlString.escape(i.a)].join(',')})`))
      : null;
  const tagsString =
    trail.tags.length > 0
      ? await Promise.all(trail.tags.map((i) => `(${[2, trail.c, SqlString.escape(i.key)].join(',')})`))
      : null;

  return Promise.resolve({
    rowArray: `(${rowArray.join(', ')})`,
    superCategories: innerSuperCategories ? _.uniq(innerSuperCategories).join(',\n') : null,
    stewardships: stewardships ? _.uniq(stewardships).join(',\n') : null,
    tags: tagsString ? _.uniq(tagsString).join(',\n') : null,
  });
}

async function createAreaInsert(areaRows: ProcessedRow[]) {
  const dataRows = areaRows.map((item) => item.rowArray);
  const dataRowsSql = dataRows.join(',\n');
  let insertQuery = `INSERT INTO features 
        (feature_id, name, owner_id, image_file, image_id, feature_type, closed, bounds_max_lat, bounds_max_lon, bounds_min_lat, bounds_min_lon, lat, lon, visibility, area_meters) 
    VALUES ${dataRowsSql};`;

  let innerSuperCategories = await Promise.all(areaRows.map((item) => item.superCategories));
  innerSuperCategories = innerSuperCategories.filter((i) => i !== null);

  if (innerSuperCategories.length > 0) {
    const superCategoryQuery = innerSuperCategories.join(',\n');
    insertQuery += `\nINSERT INTO feature_super_categories (feature_type,feature_id,super_category_id) VALUES\n`;
    insertQuery += superCategoryQuery + ';';
  }

  let stewardships = await Promise.all(areaRows.map((item) => item.stewardships));
  stewardships = stewardships.filter((i) => i !== null);

  if (stewardships.length > 0) {
    const stewardshipsQuery = stewardships.join(',\n');
    insertQuery += `\nINSERT INTO feature_stewardships (feature_type,feature_id,organization_id,role) VALUES\n`;
    insertQuery += stewardshipsQuery + ';';
  }

  let tags = await Promise.all(areaRows.map((item) => item.tags));
  tags = tags.filter((i) => i !== null);

  if (tags.length > 0) {
    const tagsQuery = tags.join(',\n');
    insertQuery += `\nINSERT INTO feature_tags (feature_type,feature_id,key) VALUES\n`;
    insertQuery += tagsQuery + ';';
  }

  return insertQuery;
}

async function createOutingInsert(outingRows: ProcessedRow[]) {
  const dataRows = outingRows.map((item) => item.rowArray);
  const dataRowsSql = dataRows.join(',\n');
  let insertQuery = `INSERT INTO features 
        (feature_id, name, owner_id, image_file, image_id, feature_type, visibility, bounds_max_lat, bounds_max_lon, bounds_min_lat, bounds_min_lon, lat, lon, closed, difficulty, route_type, display_length, length_meters) 
    VALUES ${dataRowsSql};`;

  let innerSuperCategories = await Promise.all(outingRows.map((item) => item.superCategories));
  innerSuperCategories = innerSuperCategories.filter((i) => i !== null);

  if (innerSuperCategories.length > 0) {
    insertQuery += `\nINSERT INTO feature_super_categories (feature_type,feature_id,super_category_id) VALUES\n`;
    const superCategoryQuery = innerSuperCategories.join(',\n');
    insertQuery += superCategoryQuery + ';';
  }

  let stewardships = await Promise.all(outingRows.map((item) => item.stewardships));
  stewardships = stewardships.filter((i) => i !== null);

  if (stewardships.length > 0) {
    insertQuery += `\nINSERT INTO feature_stewardships (feature_type,feature_id,organization_id,role) VALUES\n`;
    const stewardshipsQuery = stewardships.join(',\n');
    insertQuery += stewardshipsQuery + ';';
  }

  let outings = await Promise.all(outingRows.map((item) => item.outings));
  outings = outings.filter((i) => i !== null);

  if (outings.length > 0) {
    insertQuery += `\nINSERT INTO feature_outings (feature_type,feature_id,outing_id) VALUES\n`;
    const outingsQuery = outings.join(',\n');
    insertQuery += outingsQuery + ';';
  }

  let tags = await Promise.all(outingRows.map((item) => item.tags));
  tags = tags.filter((i) => i !== null);

  if (tags.length > 0) {
    const tagsQuery = tags.join(',\n');
    insertQuery += `\nINSERT INTO feature_tags (feature_type,feature_id,key) VALUES\n`;
    insertQuery += tagsQuery + ';';
  }

  return insertQuery;
}

async function createPoiInsert(poiRows: ProcessedRow[]) {
  const dataRows = poiRows.map((item) => item.rowArray);
  const dataRowsSql = dataRows.join(',\n');
  let insertQuery = `INSERT INTO features 
        (feature_id, name, owner_id, image_file, image_id, feature_type, closed, area_id, lat, lon, poi_type, visibility) 
    VALUES ${dataRowsSql};`;

  let innerSuperCategories = await Promise.all(poiRows.map((item) => item.superCategories));
  innerSuperCategories = innerSuperCategories.filter((i) => i !== null);

  if (innerSuperCategories.length > 0) {
    insertQuery += `\nINSERT INTO feature_super_categories (feature_type,feature_id,super_category_id) VALUES\n`;
    const superCategoryQuery = innerSuperCategories.join(',\n');
    insertQuery += superCategoryQuery + ';';
  }

  let stewardships = await Promise.all(poiRows.map((item) => item.stewardships));
  stewardships = stewardships.filter((i) => i !== null);

  if (stewardships.length > 0) {
    insertQuery += `\nINSERT INTO feature_stewardships (feature_type,feature_id,organization_id,role) VALUES\n`;
    const stewardshipsQuery = stewardships.join(',\n');
    insertQuery += stewardshipsQuery + ';';
  }

  let tags = await Promise.all(poiRows.map((item) => item.tags));
  tags = tags.filter((i) => i !== null);

  if (tags.length > 0) {
    const tagsQuery = tags.join(',\n');
    insertQuery += `\nINSERT INTO feature_tags (feature_type,feature_id,key) VALUES\n`;
    insertQuery += tagsQuery + ';';
  }

  return insertQuery;
}

async function createTrailInsert(trailRows: ProcessedRow[]) {
  const dataRows = trailRows.map((item) => item.rowArray);
  const dataRowsSql = dataRows.join(',\n');
  let insertQuery = `INSERT INTO features
        (feature_id, name, owner_id, image_file, image_id, feature_type, area_id, closed, bounds_max_lat, bounds_max_lon, bounds_min_lat, bounds_min_lon, lat, lon, visibility, length_meters) 
    VALUES ${dataRowsSql};`;

  let innerSuperCategories = await Promise.all(trailRows.map((item) => item.superCategories));
  innerSuperCategories = innerSuperCategories.filter((i) => i !== null);

  if (innerSuperCategories.length > 0) {
    const superCategoryQuery = innerSuperCategories.join(',\n');
    insertQuery += `\nINSERT INTO feature_super_categories (feature_type,feature_id,super_category_id) VALUES\n`;
    insertQuery += superCategoryQuery + ';';
  }

  let stewardships = await Promise.all(trailRows.map((item) => item.stewardships));
  stewardships = stewardships.filter((i) => i !== null);

  if (stewardships.length > 0) {
    const stewardshipsQuery = stewardships.join(',\n');
    insertQuery += `\nINSERT INTO feature_stewardships (feature_type,feature_id,organization_id,role) VALUES\n`;
    insertQuery += stewardshipsQuery + ';';
  }

  let tags = await Promise.all(trailRows.map((item) => item.tags));
  tags = tags.filter((i) => i !== null);

  if (tags.length > 0) {
    const tagsQuery = tags.join(',\n');
    insertQuery += `\nINSERT INTO feature_tags (feature_type,feature_id,key) VALUES\n`;
    insertQuery += tagsQuery + ';';
  }

  return insertQuery;
}

const createDBQuery =
  `CREATE TABLE articles (
        id INTEGER PRIMARY KEY,
        name VARCHAR
    );` +
  `CREATE TABLE challenges (
        id INTEGER PRIMARY KEY,
        name VARCHAR
    );` +
  `CREATE TABLE events (
        id INTEGER PRIMARY KEY,
        name VARCHAR
    );` +
  `CREATE TABLE feature_stewardships (
        id INTEGER PRIMARY KEY,
        feature_type INTEGER,
        feature_id INTEGER,
        organization_id INTEGER,
        role VARCHAR
    );` +
  `CREATE TABLE feature_outings (
        id INTEGER PRIMARY KEY,
        feature_type INTEGER,
        feature_id INTEGER,
        outing_id INTEGER        
    );` +
  `CREATE TABLE feature_super_categories (
        id INTEGER PRIMARY KEY,
        feature_type INTEGER,
        feature_id INTEGER,
        super_category_id INTEGER
    );` +
  `CREATE TABLE feature_types (
        id INTEGER PRIMARY KEY,
        name VARCHAR
    );` +
  `CREATE TABLE feature_tags (
        id INTEGER PRIMARY KEY,
        feature_type INTEGER,
        feature_id INTEGER,
        key VARCHAR
    );` +
  `CREATE TABLE tag_descriptors (
    id INTEGER PRIMARY KEY,
    feature_type INTEGER,
    key VARCHAR,    
    name VARCHAR,
    category VARCHAR,
    super_category_id INTEGER
);` +
  `CREATE TABLE features (
        id INTEGER PRIMARY KEY, 
        area_id INTEGER,
        closed INTEGER, 
        feature_id INTEGER,
        owner_id INTEGER, 
        bounds_max_lat FLOAT,
        bounds_max_lon FLOAT,
        bounds_min_lat FLOAT,
        bounds_min_lon FLOAT,
        lat FLOAT,
        lon FLOAT,
        image_file VARCHAR,
        image_id INTEGER,
        name VARCHAR,
        poi_type INTEGER,
        feature_type INTEGER,
        visibility INTEGER,
        area_meters FLOAT,
        difficulty VARCHAR,
        route_type VARCHAR,
        display_length VARCHAR,
        length_meters FLOAT
    );` +
  `CREATE TABLE metadata (
        id INTEGER PRIMARY KEY,
        name VARCHAR,
        value VARCHAR
    );` +
  `CREATE TABLE organizations (
        id INTEGER PRIMARY KEY,
        image_file VARCHAR,
        image_id INTEGER,
        name VARCHAR
    );` +
  `CREATE TABLE poi_types (
        id INTEGER PRIMARY KEY,
        name VARCHAR
    );` +
  `CREATE TABLE super_categories (
        id INTEGER PRIMARY KEY,
        name VARCHAR
    );` +
  `CREATE TABLE visibilities (
        id INTEGER PRIMARY KEY,
        name VARCHAR
    );`;

const seedDBQuery =
  `INSERT INTO feature_types ( id, name ) VALUES (1,'Area'), (2,'Trail'), (3,'PointOfInterest'), (4, 'Outing');` +
  `INSERT INTO metadata (name, value) VALUES ('version','${SCHEMA_VERSION}'), ('created_at',${SqlString.escape(
    new Date().toISOString()
  )});` +
  `INSERT INTO visibilities ( id, name ) VALUES (1,'Draft'), (2,'Published'), (3,'Archived');`;

const indexDBQuery =
  `CREATE INDEX idx_area_id ON features (area_id);` +
  `CREATE INDEX idx_feature_type ON features (feature_type);` +
  `CREATE INDEX idx_visibility ON features (visibility);` +
  `CREATE INDEX idx_feature_outing_type ON feature_outings (feature_type);` +
  `CREATE INDEX idx_feature_outing_id ON feature_outings (feature_id);` +
  `CREATE INDEX idx_feature_sc_type ON feature_super_categories (feature_type);` +
  `CREATE INDEX idx_feature_sc_id ON feature_super_categories (feature_id);` +
  `CREATE INDEX idx_feature_s_type ON feature_stewardships (feature_type);` +
  `CREATE INDEX idx_feature_s_id ON feature_stewardships (feature_id);` +
  `CREATE INDEX idx_feature_t_type ON feature_tags (feature_type);` +
  `CREATE INDEX idx_feature_t_id ON feature_tags (feature_id);`;

async function exportDatabase(
  communityId: number,
  areaRows: ProcessedRow[],
  trailRows: ProcessedRow[],
  poiRows: ProcessedRow[],
  outingRows: ProcessedRow[],
  insertPOITypesQuery: string,
  insertSuperCategoriesQuery: string,
  insertTagDescriptorsQuery: string,
  insertOrganizationsQuery: string,
  insertArticlesQuery: string | null,
  insertChallengesQuery: string | null,
  insertEventsQuery: string | null
) {
  const dbPath = `/tmp/exports/sqlite/community_${communityId}_features.db`;

  console.log(communityId, 'Exporting database');
  await mkdirp('/tmp/exports/sqlite');

  try {
    fs.unlinkSync(dbPath);
  } catch {
    // do nothing
  }

  console.log(communityId, 'Creating database file at', dbPath);

  console.log(communityId, 'Initializing database');
  // Create a new database
  const db = new Database(dbPath);

  try {
    const insertAreasQuery = await createAreaInsert(areaRows);
    const insertOutingsQuery = await createOutingInsert(outingRows);
    const insertPoisQuery = await createPoiInsert(poiRows);
    const insertTrailsQuery = await createTrailInsert(trailRows);

    // Create schema
    db.exec(createDBQuery);
    db.exec(seedDBQuery);
    db.exec(indexDBQuery);

    // Insert metadata
    if (insertOrganizationsQuery) {
      console.log(communityId, 'Inserting organizations');
      db.exec(insertOrganizationsQuery);
    }
    if (insertPOITypesQuery) {
      console.log(communityId, 'Inserting point of interest types');
      db.exec(insertPOITypesQuery);
    }
    if (insertSuperCategoriesQuery) {
      console.log(communityId, 'Inserting super categories');
      db.exec(insertSuperCategoriesQuery);
    }
    if (insertTagDescriptorsQuery) {
      console.log(communityId, 'Inserting tag descriptors');
      db.exec(insertTagDescriptorsQuery);
    }

    if (insertArticlesQuery) {
      console.log(communityId, 'Inserting articles');
      db.exec(insertArticlesQuery);
    }
    if (insertChallengesQuery) {
      console.log(communityId, 'Inserting challenges');
      db.exec(insertChallengesQuery);
    }
    if (insertEventsQuery) {
      console.log(communityId, 'Inserting events');
      db.exec(insertEventsQuery);
    }

    // Insert features
    if (areaRows.length > 0) {
      console.log(communityId, 'Inserting', areaRows.length, 'areas');
      db.exec(insertAreasQuery);
    }
    if (outingRows.length > 0) {
      console.log(communityId, 'Inserting', outingRows.length, 'outings');
      db.exec(insertOutingsQuery);
    }
    if (poiRows.length > 0) {
      console.log(communityId, 'Inserting', poiRows.length, 'points of interest');
      db.exec(insertPoisQuery);
    }
    if (trailRows.length > 0) {
      console.log(communityId, 'Inserting', trailRows.length, 'trails');
      db.exec(insertTrailsQuery);
    }

    // Close the database to ensure all data is written
    db.close();

    console.log(communityId, 'Compressing database');

    return new Promise((resolve, reject) => {
      const readStream = fs.createReadStream(dbPath);
      const writeStream = fs.createWriteStream(`${dbPath}.gz`);
      const gzip = createGzip();

      readStream
        .pipe(gzip)
        .pipe(writeStream)
        .on('finish', async () => {
          try {
            console.log(communityId, 'Uploading to S3');
            const fileBuffer = await fs.promises.readFile(`${dbPath}.gz`);
            const s3Key = `exports/sqlite/${SCHEMA_VERSION}/community_${communityId}_features.db.gz`;

            const uploadParams = {
              Bucket: sqliteBucket,
              Key: s3Key,
              Body: fileBuffer,
              ContentType: 'application/octet-stream',
              ContentEncoding: 'gzip',
            };

            const command = new PutObjectCommand(uploadParams);
            await s3Client.send(command);

            console.log(communityId, 'Upload completed');

            // Clean up files
            fs.unlinkSync(dbPath);
            fs.unlinkSync(`${dbPath}.gz`);

            resolve(undefined);
          } catch (error) {
            reject(error);
          }
        })
        .on('error', reject);
    });
  } catch (error) {
    // Try to close the database if it's still open
    try {
      db.close();
    } catch {
      // Ignore close errors
    }
    throw error;
  }
}

async function processArticles(articleResults: DatabaseQueryResult<ArticleRow>) {
  const articleRows = articleResults.rows
    .map((row) => {
      const rowArray = [row.id, SqlString.escape(row.name)];
      return `(${rowArray.join(', ')})`;
    })
    .join(',\n');

  return `INSERT INTO articles (id, name) VALUES ${articleRows};`;
}

async function processChallenges(challengeResults: DatabaseQueryResult<ChallengeRow>) {
  const challengeRows = challengeResults.rows
    .map((row) => {
      const rowArray = [row.id, SqlString.escape(row.name)];
      return `(${rowArray.join(', ')})`;
    })
    .join(',\n');

  return `INSERT INTO challenges (id, name) VALUES ${challengeRows};`;
}

async function processEvents(eventResults: DatabaseQueryResult<EventRow>) {
  const eventRows = eventResults.rows
    .map((row) => {
      const rowArray = [row.id, SqlString.escape(row.name)];
      return `(${rowArray.join(', ')})`;
    })
    .join(',\n');

  return `INSERT INTO events (id, name) VALUES ${eventRows};`;
}

async function processOrganizations(organizationResults: DatabaseQueryResult<OrganizationRow>) {
  if (!organizationResults.rows || organizationResults.rows.length === 0) {
    return '';
  }

  const organizationRows = organizationResults.rows
    .map((row) => {
      const rowArray = [
        row.id,
        SqlString.escape(row.uploaded_file),
        row.logo_image_id || 'null',
        SqlString.escape(row.name),
      ];
      return `(${rowArray.join(', ')})`;
    })
    .join(',\n');

  return `INSERT INTO organizations (id, image_file, image_id, name) VALUES ${organizationRows};`;
}

async function processPOITypes(poiTypeResults: DatabaseQueryResult<POITypeRow>) {
  if (!poiTypeResults.rows || poiTypeResults.rows.length === 0) {
    return '';
  }

  const poiTypeRows = poiTypeResults.rows
    .map((row) => {
      const rowArray = [row.id, SqlString.escape(row.name)];
      return `(${rowArray.join(', ')})`;
    })
    .join(',\n');

  return `INSERT INTO poi_types (id, name) VALUES ${poiTypeRows};`;
}

async function processSuperCategories(superCategoryResults: DatabaseQueryResult<SuperCategoryRow>) {
  if (!superCategoryResults.rows || superCategoryResults.rows.length === 0) {
    return '';
  }

  const superCategoryRows = superCategoryResults.rows
    .map((row) => {
      const rowArray = [row.id, SqlString.escape(row.name)];
      return `(${rowArray.join(', ')})`;
    })
    .join(',\n');

  return `INSERT INTO super_categories (id, name) VALUES ${superCategoryRows};`;
}

async function processTagDescriptors(tagDescriptorResults: DatabaseQueryResult<TagDescriptorRow>) {
  const tagDescriptorRows = tagDescriptorResults.rows
    .map((row) => {
      const rowArray = [
        row.id,
        SqlString.escape(row.feature_type),
        SqlString.escape(row.key),
        SqlString.escape(row.name),
        SqlString.escape(row.category),
        row.super_category_id || 'null',
      ];
      return `(${rowArray.join(', ')})`;
    })
    .join(',\n');

  return tagDescriptorRows.length > 0
    ? `INSERT INTO tag_descriptors (id, feature_type, key, name, category, super_category_id) VALUES ${tagDescriptorRows};`
    : '';
}

export async function buildCommunityDB(
  id: number,
  insertPOITypesQuery?: string,
  insertSuperCategoriesQuery?: string,
  insertTagDescriptorsQuery?: string
) {
  console.log(id, 'Querying');

  let _insertPOITypesQuery = insertPOITypesQuery;
  let _insertSuperCategoriesQuery = insertSuperCategoriesQuery;
  let _insertTagDescriptorsQuery = insertTagDescriptorsQuery;

  if (!insertPOITypesQuery || !insertSuperCategoriesQuery) {
    const poiTypeResults = await getPOITypes();
    _insertPOITypesQuery = await processPOITypes(poiTypeResults);

    const tagCategoryResults = await getSuperCategories();
    _insertSuperCategoriesQuery = await processSuperCategories(tagCategoryResults);

    const tagDescriptorResults = await getTagDescriptors();
    _insertTagDescriptorsQuery = await processTagDescriptors(tagDescriptorResults);
  }

  const articleResults = await getArticles(id);
  const _insertArticlesQuery = articleResults.rows?.length > 0 ? await processArticles(articleResults) : null;

  const challengeResults = await getChallenges(id);
  const _insertChallengesQuery = challengeResults.rows?.length > 0 ? await processChallenges(challengeResults) : null;

  const eventResults = await getEvents(id);
  const _insertEventsQuery = eventResults.rows?.length > 0 ? await processEvents(eventResults) : null;

  const organizationResults = await getOrganizations(id);
  const _insertOrganizationsQuery = await processOrganizations(organizationResults);

  const featureIndexResults = await graphqlClient.query<FeatureIndexResult['data']>({
    query: FEATURE_INDEX_QUERY,
    variables: {
      communityId: id,
    },
  });

  console.log(id, 'Processing features');

  const areaNodes = featureIndexResults.data?.a
    ? featureIndexResults.data.a.a.filter((v, i, a) => a.map((e) => e.b.b).indexOf(v.b.b) === i)
    : [];

  const areaRows = await Promise.all(areaNodes.map((item: AreaNode) => processArea(item)));

  const outingRows = featureIndexResults.data?.b
    ? await Promise.all(featureIndexResults.data.b.a.map((item: OutingNode) => processOuting(item)))
    : [];
  const poiRows = featureIndexResults.data?.c
    ? await Promise.all(featureIndexResults.data.c.a.map((item: PoiNode) => processPointOfInterest(item)))
    : [];
  const trailRows = featureIndexResults.data?.d
    ? await Promise.all(featureIndexResults.data.d.a.map((item: TrailNode) => processTrail(item)))
    : [];

  await exportDatabase(
    id,
    areaRows,
    trailRows,
    poiRows,
    outingRows,
    _insertPOITypesQuery || '',
    _insertSuperCategoriesQuery || '',
    _insertTagDescriptorsQuery || '',
    _insertOrganizationsQuery,
    _insertArticlesQuery,
    _insertChallengesQuery,
    _insertEventsQuery
  );

  return Promise.resolve(id);
}

export async function buildCommunityDBs(force = false) {
  const db = await getEventsClient();
  try {
    const query = `
        select count(*) from hasura_events where table_name in 
        ('challenges','communities','content_bundles','events','organizations','points_of_interest','tags','areas','outings','stewardships','image_attachments','trails') 
        and created_at > NOW() - INTERVAL '1.1 hour';
    `;
    const results = await db.query(query);
    console.log(results.rows[0]['count'], 'CHANGES');
    if (!force && results.rows[0]['count'] == 0) {
      return false;
    }

    const communitiesResults = await graphqlClient.query<CommunityQueryResult>({
      query: COMMUNITIES_QUERY,
    });

    if (!communitiesResults.data || !communitiesResults.data.communities) {
      throw new Error('No communities data found');
    }

    const poiTypeResults = await getPOITypes();
    const insertPOITypesQuery = await processPOITypes(poiTypeResults);

    const tagCategoryResults = await getSuperCategories();
    const insertSuperCategoriesQuery = await processSuperCategories(tagCategoryResults);

    const tagDescriptorResults = await getTagDescriptors();
    const insertTagDescriptorsQuery = await processTagDescriptors(tagDescriptorResults);

    const buildResults = await Promise.allSettled(
      communitiesResults.data.communities.map((item) =>
        buildCommunityDB(item.id, insertPOITypesQuery, insertSuperCategoriesQuery, insertTagDescriptorsQuery)
      )
    );

    return buildResults;
  } finally {
    db.end();
  }
}
