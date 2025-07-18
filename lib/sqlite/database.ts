import { getClient } from '@/lib/database';

export const getTagDescriptors = async () => {
  const client = await getClient();
  try {
    const query = `
      SELECT td.id, td.name, td.key, td.feature_type, td.super_category_id, tc.name as category 
      FROM tag_descriptors td 
      JOIN tag_categories tc ON td.tag_category_id = tc.id;
    `;
    const results = await client.query(query);
    return results;
  } finally {
    client.end();
  }
};

export const getPOITypes = async () => {
  const client = await getClient();
  try {
    const query = `SELECT * FROM point_of_interest_types;`;
    const results = await client.query(query);
    return results;
  } finally {
    client.end();
  }
};

export const getSuperCategories = async () => {
  const client = await getClient();
  try {
    const query = `SELECT * FROM tag_categories WHERE group_id IS NOT NULL;`;
    const results = await client.query(query);
    return results;
  } finally {
    client.end();
  }
};

export const getArticles = async (communityId: number) => {
  const client = await getClient();
  try {
    const query = `
      SELECT * FROM content_bundles 
      WHERE visibility = 'Published' 
      AND feature_id IN (
        SELECT member_id FROM community_memberships 
        WHERE community_id = $1 AND member_type = 'Organization'
      );
    `;
    const results = await client.query(query, [communityId]);
    return results;
  } finally {
    client.end();
  }
};

export const getChallenges = async (communityId: number) => {
  const client = await getClient();
  try {
    const query = `
      SELECT * FROM challenges 
      WHERE organization_id IN (
        SELECT member_id FROM community_memberships 
        WHERE community_id = $1 AND member_type = 'Organization'
      );
    `;
    const results = await client.query(query, [communityId]);
    return results;
  } finally {
    client.end();
  }
};

export const getEvents = async (communityId: number) => {
  const client = await getClient();
  try {
    const query = `
      SELECT * FROM future_events 
      WHERE id IN (
        SELECT id FROM events 
        WHERE organization_id IN (
          SELECT member_id FROM community_memberships 
          WHERE community_id = $1 AND member_type = 'Organization'
        )
      );
    `;
    const results = await client.query(query, [communityId]);
    return results;
  } finally {
    client.end();
  }
};

export const getOrganizations = async (communityId: number) => {
  const client = await getClient();
  try {
    const query = `
      SELECT o.id AS id, o.logo_image_id AS logo_image_id, o.name AS name, i.uploaded_file AS uploaded_file 
      FROM organizations o 
      LEFT JOIN images i ON o.logo_image_id = i.id 
      WHERE o.id IN (
        SELECT member_id FROM community_memberships 
        WHERE community_id = $1 AND member_type = 'Organization'
      );
    `;
    const results = await client.query(query, [communityId]);
    return results;
  } finally {
    client.end();
  }
};
