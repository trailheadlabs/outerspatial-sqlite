import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  getTagDescriptors,
  getPOITypes,
  getSuperCategories,
  getArticles,
  getChallenges,
  getEvents,
  getOrganizations,
} from './database';

// Mock database client
const mockClient = {
  query: vi.fn(),
  release: vi.fn(),
};

// Mock getClient function
vi.mock('@/lib/database', () => ({
  getClient: vi.fn(() => Promise.resolve(mockClient)),
}));

describe('SQLite Database Functions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    // Ensure client is always released
    expect(mockClient.release).toHaveBeenCalled();
  });

  describe('getTagDescriptors', () => {
    it('should fetch tag descriptors with joined category names', async () => {
      const mockResults = {
        rows: [
          {
            id: 1,
            name: 'Difficulty',
            key: 'difficulty',
            feature_type: 'Trail',
            super_category_id: 1,
            category: 'Trail Info',
          },
          {
            id: 2,
            name: 'Surface',
            key: 'surface',
            feature_type: 'Trail',
            super_category_id: 1,
            category: 'Trail Info',
          },
        ],
      };

      mockClient.query.mockResolvedValueOnce(mockResults);

      const result = await getTagDescriptors();

      expect(result).toEqual(mockResults);
      expect(mockClient.query).toHaveBeenCalledWith(
        expect.stringContaining(
          'SELECT td.id, td.name, td.key, td.feature_type, td.super_category_id, tc.name as category'
        )
      );
      expect(mockClient.query).toHaveBeenCalledWith(expect.stringContaining('FROM tag_descriptors td'));
      expect(mockClient.query).toHaveBeenCalledWith(
        expect.stringContaining('JOIN tag_categories tc ON td.tag_category_id = tc.id')
      );
    });

    it('should release client on error', async () => {
      mockClient.query.mockRejectedValueOnce(new Error('Database error'));

      await expect(getTagDescriptors()).rejects.toThrow('Database error');
      expect(mockClient.release).toHaveBeenCalled();
    });
  });

  describe('getPOITypes', () => {
    it('should fetch all POI types', async () => {
      const mockResults = {
        rows: [
          { id: 1, name: 'Viewpoint' },
          { id: 2, name: 'Parking' },
          { id: 3, name: 'Restroom' },
        ],
      };

      mockClient.query.mockResolvedValueOnce(mockResults);

      const result = await getPOITypes();

      expect(result).toEqual(mockResults);
      expect(mockClient.query).toHaveBeenCalledWith('SELECT * FROM point_of_interest_types;');
    });

    it('should release client on error', async () => {
      mockClient.query.mockRejectedValueOnce(new Error('Database error'));

      await expect(getPOITypes()).rejects.toThrow('Database error');
      expect(mockClient.release).toHaveBeenCalled();
    });
  });

  describe('getSuperCategories', () => {
    it('should fetch super categories with group_id', async () => {
      const mockResults = {
        rows: [
          { id: 1, name: 'Outdoor', group_id: 1 },
          { id: 2, name: 'Indoor', group_id: 1 },
        ],
      };

      mockClient.query.mockResolvedValueOnce(mockResults);

      const result = await getSuperCategories();

      expect(result).toEqual(mockResults);
      expect(mockClient.query).toHaveBeenCalledWith('SELECT * FROM tag_categories WHERE group_id IS NOT NULL;');
    });

    it('should release client on error', async () => {
      mockClient.query.mockRejectedValueOnce(new Error('Database error'));

      await expect(getSuperCategories()).rejects.toThrow('Database error');
      expect(mockClient.release).toHaveBeenCalled();
    });
  });

  describe('getArticles', () => {
    it('should fetch published articles for a community', async () => {
      const communityId = 123;
      const mockResults = {
        rows: [
          { id: 1, title: 'Trail Guide', visibility: 'Published' },
          { id: 2, title: 'Safety Tips', visibility: 'Published' },
        ],
      };

      mockClient.query.mockResolvedValueOnce(mockResults);

      const result = await getArticles(communityId);

      expect(result).toEqual(mockResults);
      expect(mockClient.query).toHaveBeenCalledWith(expect.stringContaining("WHERE visibility = 'Published'"), [
        communityId,
      ]);
      expect(mockClient.query).toHaveBeenCalledWith(expect.stringContaining('content_bundles'), [communityId]);
    });

    it('should use community_memberships to filter organizations', async () => {
      const communityId = 456;
      mockClient.query.mockResolvedValueOnce({ rows: [] });

      await getArticles(communityId);

      const query = mockClient.query.mock.calls[0][0];
      expect(query).toContain('SELECT member_id FROM community_memberships');
      expect(query).toContain("WHERE community_id = $1 AND member_type = 'Organization'");
      expect(mockClient.query).toHaveBeenCalledWith(expect.any(String), [communityId]);
    });

    it('should release client on error', async () => {
      mockClient.query.mockRejectedValueOnce(new Error('Database error'));

      await expect(getArticles(123)).rejects.toThrow('Database error');
      expect(mockClient.release).toHaveBeenCalled();
    });
  });

  describe('getChallenges', () => {
    it('should fetch challenges for organizations in a community', async () => {
      const communityId = 789;
      const mockResults = {
        rows: [
          { id: 1, name: '30-Day Hiking Challenge', organization_id: 10 },
          { id: 2, name: 'Peak Bagger Challenge', organization_id: 11 },
        ],
      };

      mockClient.query.mockResolvedValueOnce(mockResults);

      const result = await getChallenges(communityId);

      expect(result).toEqual(mockResults);
      expect(mockClient.query).toHaveBeenCalledWith(expect.stringContaining('SELECT * FROM challenges'), [communityId]);
      expect(mockClient.query).toHaveBeenCalledWith(expect.stringContaining('WHERE organization_id IN'), [communityId]);
    });

    it('should release client on error', async () => {
      mockClient.query.mockRejectedValueOnce(new Error('Database error'));

      await expect(getChallenges(123)).rejects.toThrow('Database error');
      expect(mockClient.release).toHaveBeenCalled();
    });
  });

  describe('getEvents', () => {
    it('should fetch future events for organizations in a community', async () => {
      const communityId = 321;
      const mockResults = {
        rows: [
          { id: 1, name: 'Trail Clean-up Day', date: '2024-06-15' },
          { id: 2, name: 'Guided Hike', date: '2024-07-01' },
        ],
      };

      mockClient.query.mockResolvedValueOnce(mockResults);

      const result = await getEvents(communityId);

      expect(result).toEqual(mockResults);
      expect(mockClient.query).toHaveBeenCalledWith(expect.stringContaining('SELECT * FROM future_events'), [
        communityId,
      ]);
      expect(mockClient.query).toHaveBeenCalledWith(expect.stringContaining('WHERE id IN'), [communityId]);
    });

    it('should filter by organization membership', async () => {
      const communityId = 654;
      mockClient.query.mockResolvedValueOnce({ rows: [] });

      await getEvents(communityId);

      const query = mockClient.query.mock.calls[0][0];
      expect(query).toContain('SELECT id FROM events');
      expect(query).toContain('WHERE organization_id IN');
      expect(query).toContain('community_memberships');
      expect(mockClient.query).toHaveBeenCalledWith(expect.any(String), [communityId]);
    });

    it('should release client on error', async () => {
      mockClient.query.mockRejectedValueOnce(new Error('Database error'));

      await expect(getEvents(123)).rejects.toThrow('Database error');
      expect(mockClient.release).toHaveBeenCalled();
    });
  });

  describe('getOrganizations', () => {
    it('should fetch organizations with logo images for a community', async () => {
      const communityId = 987;
      const mockResults = {
        rows: [
          {
            id: 1,
            logo_image_id: 100,
            name: 'Trail Association',
            uploaded_file: 'logo1.jpg',
          },
          {
            id: 2,
            logo_image_id: null,
            name: 'Park Service',
            uploaded_file: null,
          },
        ],
      };

      mockClient.query.mockResolvedValueOnce(mockResults);

      const result = await getOrganizations(communityId);

      expect(result).toEqual(mockResults);
      expect(mockClient.query).toHaveBeenCalledWith(
        expect.stringContaining('SELECT o.id AS id, o.logo_image_id AS logo_image_id'),
        [communityId]
      );
      expect(mockClient.query).toHaveBeenCalledWith(
        expect.stringContaining('LEFT JOIN images i ON o.logo_image_id = i.id'),
        [communityId]
      );
    });

    it('should filter by community membership', async () => {
      const communityId = 555;
      mockClient.query.mockResolvedValueOnce({ rows: [] });

      await getOrganizations(communityId);

      const query = mockClient.query.mock.calls[0][0];
      expect(query).toContain('WHERE o.id IN');
      expect(query).toContain('SELECT member_id FROM community_memberships');
      expect(query).toContain("WHERE community_id = $1 AND member_type = 'Organization'");
      expect(mockClient.query).toHaveBeenCalledWith(expect.any(String), [communityId]);
    });

    it('should release client on error', async () => {
      mockClient.query.mockRejectedValueOnce(new Error('Database error'));

      await expect(getOrganizations(123)).rejects.toThrow('Database error');
      expect(mockClient.release).toHaveBeenCalled();
    });
  });

  describe('Error handling', () => {
    it('should always release client even when query fails', async () => {
      const functions = [
        getTagDescriptors,
        getPOITypes,
        getSuperCategories,
        () => getArticles(123),
        () => getChallenges(123),
        () => getEvents(123),
        () => getOrganizations(123),
      ];

      for (const fn of functions) {
        mockClient.query.mockRejectedValueOnce(new Error('Connection lost'));
        mockClient.release.mockClear();

        await expect(fn()).rejects.toThrow('Connection lost');
        expect(mockClient.release).toHaveBeenCalledTimes(1);
      }
    });

    it('should propagate different error types', async () => {
      const syntaxError = new Error('Syntax error in SQL');
      syntaxError.name = 'PostgresSQLError';

      mockClient.query.mockRejectedValueOnce(syntaxError);

      await expect(getPOITypes()).rejects.toThrow('Syntax error in SQL');
      expect(mockClient.release).toHaveBeenCalled();
    });
  });

  describe('Query correctness', () => {
    it('should use parameterized queries for all functions with communityId', async () => {
      const communityId = 999;
      const functionsWithParams = [
        () => getArticles(communityId),
        () => getChallenges(communityId),
        () => getEvents(communityId),
        () => getOrganizations(communityId),
      ];

      for (const fn of functionsWithParams) {
        mockClient.query.mockResolvedValueOnce({ rows: [] });
        mockClient.release.mockClear();

        await fn();

        // Verify parameterized query was used
        expect(mockClient.query).toHaveBeenCalledWith(expect.any(String), [communityId]);
      }
    });

    it('should not use parameters for functions without communityId', async () => {
      const functionsWithoutParams = [getTagDescriptors, getPOITypes, getSuperCategories];

      for (const fn of functionsWithoutParams) {
        mockClient.query.mockResolvedValueOnce({ rows: [] });
        mockClient.release.mockClear();

        await fn();

        // Verify no parameters were passed
        expect(mockClient.query).toHaveBeenCalledWith(expect.any(String));
        expect(mockClient.query).not.toHaveBeenCalledWith(expect.any(String), expect.any(Array));
      }
    });
  });
});
