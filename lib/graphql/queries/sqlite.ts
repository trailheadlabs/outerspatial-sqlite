import { gql } from '@apollo/client/core';

export const CHALLENGES_QUERY = gql`
  query challenges($communityId: Int!) {
    challenges(where: { organization: { community_memberships: { community_id: { _eq: $communityId } } } }) {
      id
      name
    }
  }
`;

export const COMMUNITIES_QUERY = gql`
  query communities {
    communities {
      id
    }
  }
`;

export const CONTENT_BUNDLES_QUERY = gql`
  query content_bundles($communityId: Int!) {
    content_bundles(
      where: {
        _and: [
          { organization: { community_memberships: { community_id: { _eq: $communityId } } } }
          { visibility: { _eq: "Published" } }
        ]
      }
    ) {
      id
      name
    }
  }
`;

export const EVENTS_QUERY = gql`
  query events($communityId: Int!) {
    future_events(
      where: { event: { organization: { community_memberships: { community_id: { _eq: $communityId } } } } }
    ) {
      event {
        id
        name
      }
    }
  }
`;

export const ORGANIZATIONS_QUERY = gql`
  query organizations($communityId: Int!) {
    organizations(where: { community_memberships: { community_id: { _eq: $communityId } } }) {
      id
      logo_image {
        id
        uploaded_file
      }
      name
    }
  }
`;

export const POI_TYPES_QUERY = gql`
  query POITypes {
    point_of_interest_types {
      id
      name
    }
  }
`;

export const SUPER_CATEGORIES_QUERY = gql`
  query SuperCategories {
    tag_categories(where: { group: {} }, distinct_on: [name]) {
      id
      name
    }
  }
`;

export const FEATURE_INDEX_QUERY = gql`
  query CommunityFeaturesIndex($communityId: Int!, $since: timestamp = "2000-01-01") {
    a: community_organization_areas_aggregate(
      where: { community_id: { _eq: $communityId }, area: { updated_at: { _gt: $since } } }
    ) {
      a: nodes {
        a: organization_id
        b: area {
          a: closed {
            status
          }
          b: id
          c: image_attachments(order_by: { position: asc }, limit: 1, where: { position: { _is_null: false } }) {
            a: image {
              a: id
              b: uploaded_file
            }
          }
          d: name
          e: centroid {
            a: geometry
          }
          f: extent {
            a: geometry
          }
          g: super_categories {
            a: id
          }
          h: visibility
          s: stewardships {
            a: role
            b: organization_id
          }
          t: size {
            a: meters
          }
          tags(where: { value: { _eq: "yes" } }) {
            key
          }
        }
      }
    }
    a_ids: community_organization_areas_aggregate(where: { community_id: { _eq: $communityId } }) {
      nodes {
        area_id
      }
    }
    b: community_organization_outings_aggregate(
      where: {
        community_id: { _eq: $communityId }
        outing: {
          updated_at: { _gt: $since }
          extent: { geometry: { _is_null: false } }
          route: { geometry: { _is_null: false } }
        }
      }
    ) {
      a: nodes {
        a: organization_id
        b: outing {
          a: id
          b: featured_image {
            a: id
            b: uploaded_file
          }
          c: name
          d: start {
            a: geometry
          }
          e: extent {
            a: geometry
          }
          f: super_categories {
            a: id
          }
          g: visibility
          s: stewardships {
            a: role
            b: organization_id
          }
          closed {
            status
          }
          t: difficulty
          u: route_type
          v: display_length
          w: route {
            a: length_meters
          }
          outing_areas {
            outing_id: attached_id
            area_id: feature_id
          }
          tags(where: { value: { _eq: "yes" } }) {
            key
          }
        }
      }
    }
    b_ids: community_organization_outings_aggregate(where: { community_id: { _eq: $communityId } }) {
      nodes {
        outing_id
      }
    }
    c: community_organization_points_of_interest_aggregate(
      where: { community_id: { _eq: $communityId }, point_of_interest: { updated_at: { _gt: $since } } }
    ) {
      a: nodes {
        a: organization_id
        b: point_of_interest {
          a: area_id
          b: closed {
            status
          }
          c: id
          d: image_attachments(order_by: { position: asc }, limit: 1, where: { position: { _is_null: false } }) {
            a: image {
              a: id
              b: uploaded_file
            }
          }
          e: name
          f: location {
            a: geometry
          }
          g: point_of_interest_type_id
          h: super_categories {
            a: id
          }
          i: visibility
          s: stewardships {
            a: role
            b: organization_id
          }
          tags(where: { value: { _eq: "yes" } }) {
            key
          }
        }
      }
    }
    c_ids: community_organization_points_of_interest_aggregate(where: { community_id: { _eq: $communityId } }) {
      nodes {
        point_of_interest_id
      }
    }
    d: community_organization_trails_aggregate(
      where: { community_id: { _eq: $communityId }, trail: { updated_at: { _gt: $since } } }
    ) {
      a: nodes {
        a: organization_id
        b: trail {
          a: area_id
          b: closed {
            status
          }
          c: id
          d: image_attachments(order_by: { position: asc }, limit: 1, where: { position: { _is_null: false } }) {
            a: image {
              a: id
              b: uploaded_file
            }
          }
          e: name
          f: start {
            a: geometry
          }
          g: extent
          h: super_categories {
            a: id
          }
          i: visibility
          s: stewardships {
            a: role
            b: organization_id
          }
          t: cached_length
          tags(where: { value: { _eq: "yes" } }) {
            key
          }
        }
      }
    }
    d_ids: community_organization_trails_aggregate(where: { community_id: { _eq: $communityId } }) {
      nodes {
        trail_id
      }
    }
  }
`;
