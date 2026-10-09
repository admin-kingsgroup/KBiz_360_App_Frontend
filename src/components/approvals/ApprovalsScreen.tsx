import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, BackHandler, Modal, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { Check, ClipboardCheck, CheckCircle2, Plus, Search, Trash2, X, XCircle } from 'lucide-react-native';
import { useFocusEffect } from 'expo-router';
import { ErpApprovalsView } from '../erpApprovals/ErpApprovalsView';
import { useErpAccess } from '../erpApprovals/useErpAccess';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors } from '../../theme';
import { ageLabel, groupByPerson, isStale } from '../../logic/regularizationQueue';
import { approvalToItem, buildQueue, type QueueItem } from '../../logic/approvalQueue';
import { ApiError } from '../../api/client';
import { decideRegularization, getRegularizationsForAdmin, type Regularization } from '../../api/hr';
import { useAccessStore } from '../../store/accessStore';
import { useApprovalBadgeStore } from '../../store/approvalBadgeStore';
import { useUiStore } from '../../store/uiStore';
import type {
  Approval,
  ApprovalHierarchyResponse,
  ApprovalLevel,
  ApprovalStatus,
  ApprovalStep,
  ApprovalStepStatus,
  ApproverCandidate,
} from '../../api/approvals';
import {
  getApprovalApprovers,
  getApprovalHierarchy,
  listApprovals,
  submitApprovalRequest,
  updateApprovalDecision,
} from '../../api/approvals';

interface FormLevel {
  id: string;
  label: string;
  mode: 'all' | 'any';
  approvers: ApproverCandidate[];
}

const fmtDate = (value: string): string => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleDateString([], { day: 'numeric', month: 'short', year: 'numeric' });
};

const DEMO_APPROVALS: Approval[] = [
  {
    id: 'demo-1',
    title: 'Salary release approval',
    details: 'Requesting approval to release the September salary payment for the Ahmedabad team.',
    category: 'Salary',
    status: 'pending',
    submittedAt: '2026-09-17T09:30:00Z',
    decidedAt: null,
    requester: { id: 'u1', name: 'Rohan Mehta', initials: 'RM', color: '#37B6A4', avatar: null, position: 'Finance Officer' },
    totalLevels: 2,
    currentLevel: 1,
    currentApprovers: [{ id: 'u2', name: 'Faiz Patel', initials: 'FP', color: '#4F8BFF', avatar: null, position: 'Branch Manager' }],
    totalSteps: 2,
    currentStep: 1,
    currentApprover: { id: 'u2', name: 'Faiz Patel', initials: 'FP', color: '#4F8BFF', avatar: null, position: 'Branch Manager' },
    levels: [
      {
        order: 1,
        key: null,
        label: 'Level 1',
        mode: 'all',
        status: 'pending',
        isCurrent: true,
        decidedAt: null,
        approvedCount: 0,
        requiredCount: 1,
        approvers: [
          {
            approver: { id: 'u2', name: 'Faiz Patel', initials: 'FP', color: '#4F8BFF', avatar: null, position: 'Branch Manager' },
            status: 'pending',
            decidedAt: null,
            note: '',
          },
        ],
      },
      {
        order: 2,
        key: null,
        label: 'Level 2',
        mode: 'all',
        status: 'waiting',
        isCurrent: false,
        decidedAt: null,
        approvedCount: 0,
        requiredCount: 1,
        approvers: [
          {
            approver: { id: 'u3', name: 'Pravesh', initials: 'PR', color: '#9A6CF0', avatar: null, position: 'Company Manager' },
            status: 'waiting',
            decidedAt: null,
            note: '',
          },
        ],
      },
    ],
    steps: [
      { order: 1, key: null, label: 'Level 1', approver: { id: 'u2', name: 'Faiz Patel', initials: 'FP', color: '#4F8BFF', avatar: null, position: 'Branch Manager' }, status: 'pending', isCurrent: true, decidedAt: null, note: '' },
      { order: 2, key: null, label: 'Level 2', approver: { id: 'u3', name: 'Pravesh', initials: 'PR', color: '#9A6CF0', avatar: null, position: 'Company Manager' }, status: 'waiting', isCurrent: false, decidedAt: null, note: '' },
    ],
    isMine: true,
    canAct: true,
    canCancel: true,
    myDecision: null,
  },
  {
    id: 'demo-2',
    title: 'Today holiday approval',
    details: 'Request to mark today as a branch holiday due to the local public holiday.',
    category: 'Holiday',
    status: 'approved',
    submittedAt: '2026-09-16T12:15:00Z',
    decidedAt: '2026-09-16T12:35:00Z',
    requester: { id: 'u5', name: 'Nandni Shah', initials: 'NS', color: '#E8A13A', avatar: null, position: 'Executive' },
    totalLevels: 2,
    currentLevel: null,
    currentApprovers: [],
    totalSteps: 2,
    currentStep: null,
    currentApprover: null,
    levels: [
      {
        order: 1,
        key: null,
        label: 'Level 1',
        mode: 'all',
        status: 'approved',
        isCurrent: false,
        decidedAt: '2026-09-16T12:18:00Z',
        approvedCount: 1,
        requiredCount: 1,
        approvers: [
          {
            approver: { id: 'u2', name: 'Faiz Patel', initials: 'FP', color: '#4F8BFF', avatar: null, position: 'Branch Manager' },
            status: 'approved',
            decidedAt: '2026-09-16T12:18:00Z',
            note: 'Approved for the Ahmedabad branch.',
          },
        ],
      },
      {
        order: 2,
        key: null,
        label: 'Level 2',
        mode: 'all',
        status: 'approved',
        isCurrent: false,
        decidedAt: '2026-09-16T12:35:00Z',
        approvedCount: 1,
        requiredCount: 1,
        approvers: [
          {
            approver: { id: 'u4', name: 'Afshin Dhanani', initials: 'AD', color: '#0C0E14', avatar: null, position: 'Business Owner' },
            status: 'approved',
            decidedAt: '2026-09-16T12:35:00Z',
            note: 'Approved.',
          },
        ],
      },
    ],
    steps: [
      { order: 1, key: null, label: 'Level 1', approver: { id: 'u2', name: 'Faiz Patel', initials: 'FP', color: '#4F8BFF', avatar: null, position: 'Branch Manager' }, status: 'approved', isCurrent: false, decidedAt: '2026-09-16T12:18:00Z', note: 'Approved for the Ahmedabad branch.' },
      { order: 2, key: null, label: 'Level 2', approver: { id: 'u4', name: 'Afshin Dhanani', initials: 'AD', color: '#0C0E14', avatar: null, position: 'Business Owner' }, status: 'approved', isCurrent: false, decidedAt: '2026-09-16T12:35:00Z', note: 'Approved.' },
    ],
    isMine: false,
    canAct: false,
    canCancel: false,
    myDecision: 'approved',
  },
];

function AvatarBadge({ name, color, size = 34 }: { name: string; color?: string; size?: number }) {
  const initials = name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join('')
    .toUpperCase() || 'U';
  return (
    <View
      style={[
        styles.avatarBadge,
        {
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor: color ? `${color}20` : colors.primarySoft,
        },
      ]}
    >
      <Text style={[styles.avatarText, { fontSize: Math.max(9, size * 0.32), color: color || colors.primary }]}>
        {initials}
      </Text>
    </View>
  );
}

export function RequestForm({ onSuccess }: { onSuccess?: () => void }) {
  const accessUsers = useAccessStore((state) => state.users);
  const showToast = useUiStore((state) => state.showToast);

  const [title, setTitle] = useState('');
  const [details, setDetails] = useState('');
  const [hierarchy, setHierarchy] = useState<ApprovalHierarchyResponse | null>(null);
  const [loadingHierarchy, setLoadingHierarchy] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  // Initialize with Level 1 and Level 2
  const [levels, setLevels] = useState<FormLevel[]>([
    { id: 'lvl-1', label: 'Level 1', mode: 'all', approvers: [] },
    { id: 'lvl-2', label: 'Level 2', mode: 'all', approvers: [] },
  ]);

  // Candidates pool
  const [candidates, setCandidates] = useState<ApproverCandidate[]>([]);

  // Search state for autocomplete suggestions
  const [activeSearchLevelId, setActiveSearchLevelId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [remoteResults, setRemoteResults] = useState<ApproverCandidate[]>([]);
  const [searchingRemote, setSearchingRemote] = useState(false);

  useEffect(() => {
    let active = true;
    getApprovalHierarchy()
      .then((data) => {
        if (!active) return;
        setHierarchy(data);

        let pool: ApproverCandidate[] = data.approvers || [];
        if (pool.length === 0 && data.steps) {
          const flat: ApproverCandidate[] = [];
          data.steps.forEach((s) => {
            s.candidates.forEach((c) => {
              if (!flat.some((item) => item.id === c.id)) {
                flat.push({
                  ...c,
                  email: null,
                  role: null,
                  level: 3,
                  branches: [],
                });
              }
            });
          });
          pool = flat;
        }

        // Fallback to store users if pool is empty
        if (pool.length === 0 && accessUsers && accessUsers.length > 0) {
          pool = accessUsers.map((u) => ({
            id: u.id,
            name: u.name,
            initials: u.name.split(' ').map((p) => p[0]).join('').slice(0, 2).toUpperCase(),
            color: colors.primary,
            avatar: null,
            position: u.role || 'Member',
            email: u.email || null,
            role: u.role || null,
            level: 3,
            branches: [],
          }));
        }

        setCandidates(pool);
      })
      .catch(() => {
        // Fallback pool from access store if network or hierarchy call fails
        const pool: ApproverCandidate[] = (accessUsers || []).map((u) => ({
          id: u.id,
          name: u.name,
          initials: u.name.split(' ').map((p) => p[0]).join('').slice(0, 2).toUpperCase(),
          color: colors.primary,
          avatar: null,
          position: u.role || 'Member',
          email: u.email || null,
          role: u.role || null,
          level: 3,
          branches: [],
        }));
        setCandidates(pool);
        setHierarchy({
          totalSteps: 0,
          steps: [],
          categories: [],
          limits: { title: 120, details: 2000, note: 500, label: 40, levels: 10, approversPerLevel: 10 },
        });
      })
      .finally(() => {
        if (active) setLoadingHierarchy(false);
      });

    return () => {
      active = false;
    };
  }, [accessUsers]);

  // Debounced remote search
  useEffect(() => {
    const trimmed = searchQuery.trim();
    if (!trimmed || trimmed.length < 2) {
      setRemoteResults([]);
      return;
    }
    const timer = setTimeout(() => {
      setSearchingRemote(true);
      getApprovalApprovers(trimmed, 20)
        .then((res) => {
          if (res?.items) setRemoteResults(res.items);
        })
        .catch(() => {
          // Ignore remote search error; local pool handles filtering
        })
        .finally(() => setSearchingRemote(false));
    }, 250);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  const maxLevels = hierarchy?.limits?.levels ?? hierarchy?.levels?.max ?? 10;
  const maxApproversPerLevel = hierarchy?.limits?.approversPerLevel ?? hierarchy?.levels?.maxApproversPerLevel ?? 10;

  // Set of all selected approver IDs across all levels
  const selectedApproverIds = useMemo(() => {
    const set = new Set<string>();
    levels.forEach((lvl) => {
      lvl.approvers.forEach((app) => set.add(app.id));
    });
    return set;
  }, [levels]);

  // Combined candidates for suggestion dropdown
  const filteredSuggestions = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    const source = remoteResults.length > 0 ? [...candidates, ...remoteResults] : candidates;
    const unique = Array.from(new Map(source.map((c) => [c.id, c])).values());

    // Filter out candidates already picked on ANY level
    const available = unique.filter((c) => !selectedApproverIds.has(c.id));

    if (!query) {
      return available.slice(0, 6);
    }

    return available
      .filter((c) => {
        const nameMatch = c.name.toLowerCase().includes(query);
        const posMatch = c.position?.toLowerCase().includes(query);
        const roleMatch = c.role?.toLowerCase().includes(query);
        const emailMatch = c.email?.toLowerCase().includes(query);
        return nameMatch || posMatch || roleMatch || emailMatch;
      })
      .slice(0, 8);
  }, [candidates, remoteResults, searchQuery, selectedApproverIds]);

  const addLevel = () => {
    if (levels.length >= maxLevels) {
      showToast(`Maximum ${maxLevels} levels allowed`);
      return;
    }
    const nextNum = levels.length + 1;
    setLevels((prev) => [
      ...prev,
      {
        id: `lvl-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
        label: `Level ${nextNum}`,
        mode: 'all',
        approvers: [],
      },
    ]);
  };

  const removeLevel = (id: string) => {
    if (levels.length <= 1) {
      showToast('At least one level is required');
      return;
    }
    setLevels((prev) => {
      const remaining = prev.filter((lvl) => lvl.id !== id);
      return remaining.map((lvl, idx) => ({
        ...lvl,
        label: lvl.label.startsWith('Level ') ? `Level ${idx + 1}` : lvl.label,
      }));
    });
    if (activeSearchLevelId === id) {
      setActiveSearchLevelId(null);
      setSearchQuery('');
    }
  };

  const selectApprover = (levelId: string, candidate: ApproverCandidate) => {
    setLevels((prev) =>
      prev.map((lvl) => {
        if (lvl.id !== levelId) return lvl;
        if (lvl.approvers.some((a) => a.id === candidate.id)) return lvl;
        if (lvl.approvers.length >= maxApproversPerLevel) {
          showToast(`Maximum ${maxApproversPerLevel} approvers per level`);
          return lvl;
        }
        return {
          ...lvl,
          approvers: [...lvl.approvers, candidate],
        };
      })
    );
    setActiveSearchLevelId(null);
    setSearchQuery('');
  };

  const removeApproverFromLevel = (levelId: string, approverId: string) => {
    setLevels((prev) =>
      prev.map((lvl) => {
        if (lvl.id !== levelId) return lvl;
        return {
          ...lvl,
          approvers: lvl.approvers.filter((a) => a.id !== approverId),
        };
      })
    );
  };

  const toggleLevelMode = (levelId: string, mode: 'all' | 'any') => {
    setLevels((prev) =>
      prev.map((lvl) => (lvl.id === levelId ? { ...lvl, mode } : lvl))
    );
  };

  const submit = () => {
    const trimmedTitle = title.trim();
    const trimmedDetails = details.trim();

    if (!trimmedTitle || !trimmedDetails) {
      showToast('Please enter both title and details');
      return;
    }

    if (levels.length === 0) {
      showToast('Please add at least one level');
      return;
    }

    for (let i = 0; i < levels.length; i++) {
      if (levels[i].approvers.length === 0) {
        showToast(`Please select an approver for ${levels[i].label || `Level ${i + 1}`}`);
        return;
      }
    }

    setSubmitting(true);
    submitApprovalRequest({
      title: trimmedTitle,
      details: trimmedDetails,
      levels: levels.map((lvl, index) => ({
        label: lvl.label.trim() || `Level ${index + 1}`,
        mode: lvl.mode,
        approverIds: lvl.approvers.map((a) => a.id),
      })),
    })
      .then(() => {
        showToast('Approval request submitted successfully');
        setTitle('');
        setDetails('');
        setLevels([
          { id: `lvl-1-${Date.now()}`, label: 'Level 1', mode: 'all', approvers: [] },
          { id: `lvl-2-${Date.now()}`, label: 'Level 2', mode: 'all', approvers: [] },
        ]);
        setActiveSearchLevelId(null);
        setSearchQuery('');
        onSuccess?.();
      })
      .catch((error: Error & { message?: string }) => {
        showToast(error.message || 'Could not submit approval request');
      })
      .finally(() => {
        setSubmitting(false);
      });
  };

  if (loadingHierarchy) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  return (
    <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      {/* Title & Details Card */}
      <View style={styles.sectionCard}>
        <Text style={styles.label}>
          Title <Text style={styles.required}>*</Text>
        </Text>
        <TextInput
          value={title}
          onChangeText={setTitle}
          placeholder="e.g. Salary release approval"
          placeholderTextColor={colors.coolText3}
          style={styles.input}
          maxLength={hierarchy?.limits?.title ?? 120}
        />
        <Text style={styles.label}>
          Details <Text style={styles.required}>*</Text>
        </Text>
        <TextInput
          value={details}
          onChangeText={setDetails}
          placeholder="Explain what needs approval"
          placeholderTextColor={colors.coolText3}
          style={[styles.input, styles.multiline]}
          multiline
          textAlignVertical="top"
          maxLength={hierarchy?.limits?.details ?? 2000}
        />
      </View>

      {/* Approval Hierarchy Section */}
      <View style={styles.hierarchyHeading}>
        <View style={{ flex: 1 }}>
          <Text style={styles.sectionTitle}>Approval hierarchy</Text>
          <Text style={styles.sectionHint}>Add levels and assign approvers in review order.</Text>
        </View>
        <Pressable
          onPress={addLevel}
          disabled={levels.length >= maxLevels}
          style={[styles.addLevelHeaderBtn, levels.length >= maxLevels && styles.primaryButtonDisabled]}
          accessibilityRole="button"
          accessibilityLabel="Add level"
        >
          <Plus size={16} color={colors.primary} strokeWidth={2.6} />
          <Text style={styles.addLevelHeaderBtnText}>Add level</Text>
        </Pressable>
      </View>

      {/* Dynamic Levels Builder */}
      <View style={{ gap: 12 }}>
        {levels.map((level, index) => {
          const isSearchOpen = activeSearchLevelId === level.id;
          const hasApprovers = level.approvers.length > 0;

          return (
            <View key={level.id} style={styles.levelCard}>
              {/* Level Card Header */}
              <View style={styles.levelCardHeader}>
                <View style={styles.levelBadge}>
                  <Text style={styles.levelBadgeText}>{level.label}</Text>
                </View>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  {levels.length > 1 ? (
                    <Pressable
                      onPress={() => removeLevel(level.id)}
                      style={styles.deleteLevelBtn}
                      accessibilityRole="button"
                      accessibilityLabel={`Delete ${level.label}`}
                    >
                      <Trash2 size={16} color={colors.danger} />
                    </Pressable>
                  ) : null}
                </View>
              </View>

              {/* Selected Approvers Display */}
              {hasApprovers ? (
                <View style={{ gap: 8 }}>
                  {level.approvers.map((approver) => (
                    <View key={approver.id} style={styles.selectedApproverItem}>
                      <AvatarBadge name={approver.name} color={approver.color} size={36} />
                      <View style={{ flex: 1, marginLeft: 10 }}>
                        <Text style={styles.selectedApproverName} numberOfLines={1}>
                          {approver.name}
                        </Text>
                        <Text style={styles.selectedApproverRole} numberOfLines={1}>
                          {[approver.position, approver.role, approver.branches?.join(', ')].filter(Boolean).join(' · ') || 'Approver'}
                        </Text>
                      </View>
                      <Pressable
                        onPress={() => removeApproverFromLevel(level.id, approver.id)}
                        style={styles.removeApproverBtn}
                        accessibilityRole="button"
                        accessibilityLabel={`Remove ${approver.name}`}
                      >
                        <X size={16} color={colors.coolText} />
                      </Pressable>
                    </View>
                  ))}

                  {/* Mode switch if multiple approvers */}
                  {level.approvers.length >= 2 ? (
                    <View style={styles.modeContainer}>
                      <Text style={styles.modeCaption}>Rule:</Text>
                      <Pressable
                        onPress={() => toggleLevelMode(level.id, 'all')}
                        style={[styles.modeChip, level.mode === 'all' && styles.modeChipActive]}
                      >
                        <Text style={[styles.modeChipText, level.mode === 'all' && styles.modeChipTextActive]}>
                          All must approve
                        </Text>
                      </Pressable>
                      <Pressable
                        onPress={() => toggleLevelMode(level.id, 'any')}
                        style={[styles.modeChip, level.mode === 'any' && styles.modeChipActive]}
                      >
                        <Text style={[styles.modeChipText, level.mode === 'any' && styles.modeChipTextActive]}>
                          Any one can approve
                        </Text>
                      </Pressable>
                    </View>
                  ) : null}
                </View>
              ) : null}

              {/* Search / Enter Name Input */}
              {(!hasApprovers || isSearchOpen) ? (
                <View style={styles.searchWrap}>
                  <View style={styles.searchBox}>
                    <Search size={16} color={colors.coolText} />
                    <TextInput
                      value={isSearchOpen ? searchQuery : ''}
                      onChangeText={(text) => {
                        setActiveSearchLevelId(level.id);
                        setSearchQuery(text);
                      }}
                      onFocus={() => {
                        setActiveSearchLevelId(level.id);
                      }}
                      placeholder="Type approver name..."
                      placeholderTextColor={colors.coolText3}
                      style={styles.searchInput}
                    />
                    {isSearchOpen && searchQuery ? (
                      <Pressable onPress={() => setSearchQuery('')} style={{ padding: 4 }}>
                        <X size={14} color={colors.coolText} />
                      </Pressable>
                    ) : null}
                    {searchingRemote ? <ActivityIndicator size="small" color={colors.primary} /> : null}
                  </View>

                  {/* Dropdown Suggestions */}
                  {isSearchOpen ? (
                    <View style={styles.suggestionsBox}>
                      <View style={styles.suggestionsHeader}>
                        <Text style={styles.suggestionsHeaderTitle}>
                          {searchQuery ? 'Suggestions' : 'Suggested approvers'}
                        </Text>
                        <Pressable onPress={() => { setActiveSearchLevelId(null); setSearchQuery(''); }}>
                          <Text style={styles.closeSuggestionsText}>Close</Text>
                        </Pressable>
                      </View>
                      <ScrollView
                        nestedScrollEnabled
                        keyboardShouldPersistTaps="handled"
                        style={{ maxHeight: 220 }}
                      >
                        {filteredSuggestions.length > 0 ? (
                          filteredSuggestions.map((candidate) => (
                            <Pressable
                              key={candidate.id}
                              onPress={() => selectApprover(level.id, candidate)}
                              style={styles.suggestionRow}
                            >
                              <AvatarBadge name={candidate.name} color={candidate.color} size={32} />
                              <View style={{ flex: 1, marginLeft: 10 }}>
                                <Text style={styles.suggestionName} numberOfLines={1}>
                                  {candidate.name}
                                </Text>
                                <Text style={styles.suggestionMeta} numberOfLines={1}>
                                  {[candidate.position, candidate.role, candidate.branches?.join(', ')].filter(Boolean).join(' · ')}
                                </Text>
                              </View>
                              <Plus size={16} color={colors.primary} />
                            </Pressable>
                          ))
                        ) : (
                          <Text style={styles.emptySuggestionText}>
                            {searchQuery ? 'No matching approvers found' : 'No approvers available'}
                          </Text>
                        )}
                      </ScrollView>
                    </View>
                  ) : null}
                </View>
              ) : (
                /* Button to add another approver to this level if needed */
                level.approvers.length < maxApproversPerLevel ? (
                  <Pressable
                    onPress={() => {
                      setActiveSearchLevelId(level.id);
                      setSearchQuery('');
                    }}
                    style={styles.addAnotherBtn}
                  >
                    <Plus size={14} color={colors.primary} />
                    <Text style={styles.addAnotherBtnText}>Add another approver</Text>
                  </Pressable>
                ) : null
              )}
            </View>
          );
        })}

        {/* Plus Button to Append Level */}
        {levels.length < maxLevels ? (
          <Pressable onPress={addLevel} style={styles.addLevelDashedBtn}>
            <Plus size={17} color={colors.primary} strokeWidth={2.4} />
            <Text style={styles.addLevelDashedBtnText}>Add Level {levels.length + 1}</Text>
          </Pressable>
        ) : null}
      </View>

      {/* Submit Button */}
      <Pressable
        onPress={submit}
        disabled={submitting}
        style={[styles.primaryButton, submitting && styles.primaryButtonDisabled]}
      >
        {submitting ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <>
            <ClipboardCheck size={18} color="#fff" strokeWidth={2.5} />
            <Text style={styles.primaryButtonText}>Submit request</Text>
          </>
        )}
      </Pressable>
      <Text style={styles.footerHint}>
        All assigned approvers will be notified in order as the request progresses.
      </Text>
    </ScrollView>
  );
}

function statusMeta(status: ApprovalStatus): { label: string; color: string; background: string } {
  if (status === 'approved') return { label: 'Approved', color: colors.primary, background: colors.primarySoft };
  if (status === 'rejected') return { label: 'Rejected', color: colors.danger, background: colors.danger + '12' };
  if (status === 'cancelled') return { label: 'Withdrawn', color: colors.coolText, background: colors.coolMuted };
  return { label: 'Pending', color: colors.orange, background: colors.orange + '18' };
}

function stepStatusMeta(status: ApprovalStepStatus): { label: string; color: string } {
  if (status === 'approved') return { label: 'Approved', color: colors.primary };
  if (status === 'rejected') return { label: 'Rejected', color: colors.danger };
  if (status === 'pending') return { label: 'Pending', color: colors.orange };
  if (status === 'waiting') return { label: 'Waiting', color: colors.coolText };
  return { label: 'Skipped', color: colors.coolText3 };
}

// One queued decision, in the approved Time-corrections row shape: tick box, what is being asked,
// how long it has waited, and the two decisions right there on the row. The row does not care
// whether it came from /api/approvals or /api/hr/regularizations — approvalQueue.ts already
// flattened both to the same shape.
// Reject/Approve and the tick box appear ONLY where `canAct` is true. Someone who can see a request
// but is not its current approver gets the status instead of controls they cannot use — the list is
// shared by requesters, approvers and onlookers.
function ApprovalRow({ item, selecting, selected, busy, onPress, onToggle, onDecide }: {
  item: QueueItem;
  /** Whether the screen is in multi-select. Changes what a tap means and hides the row's own buttons. */
  selecting: boolean;
  selected: boolean;
  busy: boolean;
  onPress: () => void;
  onToggle: () => void;
  onDecide: (item: QueueItem, action: 'approve' | 'reject') => void;
}) {
  const meta = statusMeta(item.status);
  const stale = item.status === 'pending' && isStale(item.at);
  const when = item.decidedAt ?? item.at;

  return (
    // The WHOLE row is the press target, the way ChatListItem does it — a long press anywhere on it
    // enters selection. An inner flex child as the target did not receive the gesture at all, and it
    // made a smaller hit area besides. The Reject/Approve buttons below are nested Pressables and
    // still win the touch for themselves.
    // Outside the mode a tap opens the request; inside it a tap toggles. A row this viewer cannot
    // act on stays inert while selecting rather than opening something mid-selection.
    <Pressable
      onPress={selecting ? (item.canAct ? onToggle : undefined) : onPress}
      onLongPress={item.canAct ? onToggle : undefined}
      delayLongPress={300}
      android_ripple={{ color: colors.coolMuted }}
      accessibilityRole="button"
      accessibilityLabel={selecting ? `${selected ? 'Deselect' : 'Select'} ${item.title}` : `View ${item.title}`}
      style={[styles.approvalRow, selected && styles.approvalRowSelected]}
    >
      {/* The tick box exists only inside the mode, and only on rows this viewer may decide. */}
      {selecting && item.canAct ? (
        <View
          accessible
          accessibilityRole="checkbox"
          accessibilityState={{ checked: selected }}
          style={[styles.checkbox, selected && styles.checkboxOn]}
        >
          {selected ? <Check size={14} color="#fff" strokeWidth={3} /> : null}
        </View>
      ) : null}
      {/* The text owns the full row width. Buttons beside it took ~175px of 390, which squeezed
          every line into a wrap — "Out missing" split mid-phrase and the reason ran to three lines,
          leaving the right column floating against whatever height the left one reached. */}
      <View style={styles.rowMain}>
        <View style={styles.rowTop}>
          {/* Title and age are both "when this happened", so they share a line and centre on each other. */}
          <Text style={styles.cardTitle} numberOfLines={1}>
            {item.title}
          </Text>
          <View style={[styles.agePill, stale && styles.agePillStale]}>
            <Text style={[styles.ageText, stale && styles.ageTextStale]}>{ageLabel(when)}</Text>
          </View>
        </View>
        <Text style={styles.rowMeta} numberOfLines={1}>
          {item.meta}
          {item.metaTail ? (
            <Text style={item.metaWarn ? styles.rowWarn : styles.rowChain}> · {item.metaTail}</Text>
          ) : null}
        </Text>
        {/* Two lines, so one long reason cannot drag a row to twice its neighbour's height. The
            whole text is still in the detail sheet. */}
        {item.note ? (
          <Text style={styles.rowQuote} numberOfLines={2}>
            “{item.note}”
          </Text>
        ) : null}
        {/* Inside the mode the bulk bar is the only way to act, so the row's own buttons stand down
            — two live action surfaces at once makes "approve" ambiguous. */}
        {selecting ? null : (
          <View style={styles.rowActions}>
            {item.canAct ? (
              <>
                <Pressable
                  disabled={busy}
                  onPress={() => onDecide(item, 'reject')}
                  accessibilityRole="button"
                  accessibilityLabel={`Reject ${item.title}`}
                  style={[styles.rejectBtn, busy && styles.btnBusy]}
                >
                  <Text style={styles.rejectText}>Reject</Text>
                </Pressable>
                <Pressable
                  disabled={busy}
                  onPress={() => onDecide(item, 'approve')}
                  accessibilityRole="button"
                  accessibilityLabel={`Approve ${item.title}`}
                  style={[styles.approveBtn, busy && styles.btnBusy]}
                >
                  <Text style={styles.approveText}>Approve</Text>
                </Pressable>
              </>
            ) : (
              <View style={[styles.statusPill, { backgroundColor: meta.background }]}>
                <Text style={[styles.statusText, { color: meta.color }]}>{meta.label}</Text>
              </View>
            )}
          </View>
        )}
      </View>
    </Pressable>
  );
}

function ApprovalDetail({
  record,
  visible,
  busy,
  onClose,
  onDecision,
}: {
  record: Approval | null;
  visible: boolean;
  busy: boolean;
  onClose: () => void;
  onDecision: (action: 'approve' | 'reject') => void;
}) {
  if (!record) return null;
  const meta = statusMeta(record.status);

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.detailBackdrop}>
        <View style={styles.detailSheet}>
          <View style={styles.detailHandle} />
          <View style={styles.detailHeader}>
            <View style={styles.detailHeaderInfo}>
              <Text style={styles.detailTitle}>{record.title}</Text>
              <Text style={styles.detailSubtitle}>
                {record.requester.name} · {record.category}
              </Text>
            </View>
            <Pressable onPress={onClose} style={styles.closeButton} accessibilityLabel="Close approval details">
              <X size={18} color={colors.coolText} />
            </Pressable>
          </View>
          <ScrollView contentContainerStyle={styles.detailContent}>
            <View style={styles.detailSummaryCard}>
              <View style={styles.detailSummaryRow}>
                <View style={styles.detailSummaryItem}>
                  <Text style={styles.summaryLabel}>Status</Text>
                  <View style={[styles.statusPill, { backgroundColor: meta.background }]}>
                    <Text style={[styles.statusText, { color: meta.color }]}>{meta.label}</Text>
                  </View>
                </View>
                <View style={styles.detailSummaryItem}>
                  <Text style={styles.summaryLabel}>Submitted</Text>
                  <Text style={styles.summaryValue}>{fmtDate(record.submittedAt)}</Text>
                </View>
              </View>
            </View>

            <Text style={styles.detailSectionTitle}>Request details</Text>
            <Text style={styles.detailText}>{record.details}</Text>

            <Text style={styles.detailSectionTitle}>Approval hierarchy</Text>

            {/* Render dynamic levels if present, else fallback to steps */}
            {record.levels && record.levels.length > 0 ? (
              <View style={{ gap: 10 }}>
                {record.levels.map((lvl) => {
                  const lvlMeta = stepStatusMeta(lvl.status);
                  return (
                    <View key={lvl.order} style={styles.detailLevelContainer}>
                      <View style={styles.detailLevelHeader}>
                        <Text style={styles.detailLevelLabel}>{lvl.label}</Text>
                        <View
                          style={[
                            styles.inlineStatus,
                            {
                              backgroundColor:
                                lvl.status === 'approved'
                                  ? colors.primarySoft
                                  : lvl.status === 'rejected'
                                  ? colors.danger + '12'
                                  : lvl.status === 'pending'
                                  ? colors.orange + '18'
                                  : colors.coolMuted,
                            },
                          ]}
                        >
                          <Text style={[styles.inlineStatusText, { color: lvlMeta.color }]}>{lvlMeta.label}</Text>
                        </View>
                      </View>
                      {lvl.approvers.map((item, idx) => {
                        const appMeta = stepStatusMeta(item.status);
                        return (
                          <View key={item.approver.id || idx} style={styles.hierarchyRow}>
                            <View
                              style={[
                                styles.hierarchyDot,
                                {
                                  backgroundColor:
                                    item.status === 'approved'
                                      ? colors.primarySoft
                                      : item.status === 'rejected'
                                      ? colors.danger + '12'
                                      : colors.coolMuted,
                                },
                              ]}
                            >
                              <CheckCircle2
                                size={14}
                                color={
                                  item.status === 'rejected'
                                    ? colors.danger
                                    : item.status === 'approved'
                                    ? colors.primary
                                    : colors.coolText3
                                }
                              />
                            </View>
                            <AvatarBadge name={item.approver.name} color={item.approver.color} size={28} />
                            <View style={{ flex: 1, marginLeft: 8 }}>
                              <Text style={styles.hierarchyValue} numberOfLines={1}>
                                {item.approver.name}
                              </Text>
                              {item.approver.position ? (
                                <Text style={styles.rowMetaMuted} numberOfLines={1}>
                                  {item.approver.position}
                                </Text>
                              ) : null}
                              {item.note ? (
                                <Text style={styles.decisionNoteText}>Note: {item.note}</Text>
                              ) : null}
                            </View>
                            <View
                              style={[
                                styles.inlineStatus,
                                {
                                  backgroundColor:
                                    item.status === 'approved'
                                      ? colors.primarySoft
                                      : item.status === 'rejected'
                                      ? colors.danger + '12'
                                      : item.status === 'pending'
                                      ? colors.orange + '18'
                                      : colors.coolMuted,
                                },
                              ]}
                            >
                              <Text style={[styles.inlineStatusText, { color: appMeta.color }]}>{appMeta.label}</Text>
                            </View>
                          </View>
                        );
                      })}
                    </View>
                  );
                })}
              </View>
            ) : (
              (record.steps || []).map((step) => {
                const stepMeta = stepStatusMeta(step.status);
                return (
                  <View key={step.order} style={styles.hierarchyRow}>
                    <View
                      style={[
                        styles.hierarchyDot,
                        {
                          backgroundColor:
                            step.status === 'approved'
                              ? colors.primarySoft
                              : step.status === 'rejected'
                              ? colors.danger + '12'
                              : colors.coolMuted,
                        },
                      ]}
                    >
                      <CheckCircle2
                        size={14}
                        color={
                          step.status === 'rejected'
                            ? colors.danger
                            : step.status === 'approved'
                            ? colors.primary
                            : colors.coolText3
                        }
                      />
                    </View>
                    <Text style={styles.hierarchyLabel}>{step.label}</Text>
                    <Text style={styles.hierarchyValue} numberOfLines={1}>
                      {step.approver.name}
                    </Text>
                    <View
                      style={[
                        styles.inlineStatus,
                        {
                          backgroundColor:
                            step.status === 'approved'
                              ? colors.primarySoft
                              : step.status === 'rejected'
                              ? colors.danger + '12'
                              : step.status === 'pending'
                              ? colors.orange + '18'
                              : colors.coolMuted,
                        },
                      ]}
                    >
                      <Text style={[styles.inlineStatusText, { color: stepMeta.color }]}>{stepMeta.label}</Text>
                    </View>
                  </View>
                );
              })
            )}

            {record.canAct ? (
              <View style={styles.detailActions}>
                <Pressable
                  disabled={busy}
                  onPress={() => onDecision('approve')}
                  style={[styles.detailAction, { backgroundColor: busy ? colors.coolMuted : colors.primary }]}
                >
                  <CheckCircle2 size={17} color={busy ? colors.coolText3 : '#fff'} />
                  <Text style={[styles.detailActionText, { color: busy ? colors.coolText3 : '#fff' }]}>
                    Approve
                  </Text>
                </Pressable>
                <Pressable
                  disabled={busy}
                  onPress={() => onDecision('reject')}
                  style={[styles.detailAction, styles.detailReject]}
                >
                  <XCircle size={17} color={colors.danger} />
                  <Text style={[styles.detailActionText, { color: colors.danger }]}>Reject</Text>
                </Pressable>
              </View>
            ) : null}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const TABS: { key: 'all' | ApprovalStatus; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'pending', label: 'Pending' },
  { key: 'approved', label: 'Approved' },
  { key: 'rejected', label: 'Rejected' },
];

// includeCorrections=false (owner 2026-10-09): for someone who sees ERP approvals, attendance time
// corrections are decided ONLY in ERP approvals ▸ HR — one level at a time (FM → Director → Owner,
// with ticks). They are the SAME records (the app files them into the ERP's shared queue), so listing
// them here too showed every correction twice, and this list let a Super Admin approve ahead of the
// chain, which Afshin asked to stop.
function Inbox({ showTitle = true, includeCorrections = true }: { showTitle?: boolean; includeCorrections?: boolean } = {}) {
  const showToast = useUiStore((state) => state.showToast);
  const [approvals, setApprovals] = useState<Approval[] | null>(null);
  const [corrections, setCorrections] = useState<Regularization[]>([]);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [filter, setFilter] = useState<'all' | ApprovalStatus>('pending');
  const [selected, setSelected] = useState<Approval | null>(null);
  const [loadError, setLoadError] = useState(false);
  // Ids ticked for a bulk decision. A reload that settles a request simply stops matching it, so a
  // decided row can never linger in the count.
  const [picked, setPicked] = useState<Set<string>>(new Set());
  // Rejecting always takes a reason: the time-correction endpoint requires one, and a refusal
  // without a stated reason is not much use to the person who asked either way.
  const [rejecting, setRejecting] = useState<QueueItem | 'bulk' | null>(null);
  const [note, setNote] = useState('');

  const load = useCallback(() => {
    setLoadError(false);
    listApprovals('all')
      .then((response) => {
        setApprovals(response.items ?? []);
        setLoadError(false);
      })
      .catch(() => {
        setApprovals(DEMO_APPROVALS);
        setLoadError(false);
      });
    // Attendance time corrections belong in this queue too — they are decisions waiting on the same
    // person. The endpoint is super-admin only and 403s everyone else, so a failure here is the
    // normal case for most viewers and simply means "no corrections to show".
    if (!includeCorrections) { setCorrections([]); return; }
    Promise.all([
      getRegularizationsForAdmin('pending').catch(() => [] as Regularization[]),
      getRegularizationsForAdmin('approved').catch(() => [] as Regularization[]),
      getRegularizationsForAdmin('rejected').catch(() => [] as Regularization[]),
    ])
      .then((sets) => setCorrections(sets.flat()))
      .catch(() => setCorrections([]));
  }, [includeCorrections]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  // One queue out of two unrelated endpoints (approvalQueue.ts).
  const queue = useMemo(() => buildQueue(approvals ?? [], corrections), [approvals, corrections]);
  const filteredRows = useMemo(
    () => queue.filter((row) => filter === 'all' || row.status === filter),
    [queue, filter]
  );
  // The Pending tab's badge stays right while the reviewer reads the settled tabs.
  const pendingCount = useMemo(() => queue.filter((r) => r.status === 'pending').length, [queue]);
  // The bottom tab shows the same number. Pushing it from here — rather than letting the store
  // refetch — means a decision moves the tab badge the instant the list reflects it, with no
  // window where the two disagree.
  // Without corrections in this list (ERP users), the badge keeps its own count — app requests plus
  // pending corrections — so it does not drop the corrections now decided under ERP approvals ▸ HR.
  useEffect(() => {
    if (approvals !== null && includeCorrections) useApprovalBadgeStore.getState().setCount(pendingCount);
  }, [pendingCount, approvals, includeCorrections]);

  // Group under the person who raised each request — a reviewer settles one colleague's asks
  // together instead of hopping between names. groupByPerson keeps the incoming ordering, so the
  // newest request keeps its place; the QueueItem rides along on `item`.
  const groups = useMemo(
    () =>
      groupByPerson(
        filteredRows.map((item) => ({
          id: item.id,
          userId: item.personId,
          date: item.at.slice(0, 10),
          appliedAt: item.at,
          name: item.personName,
          branch: item.personSubtitle,
          item,
        }))
      ),
    [filteredRows]
  );

  // Only rows that are BOTH ticked and still on screen can be acted on — switching tabs must never
  // carry a selection into a decision the reviewer cannot see.
  const selectedRows = useMemo(
    () => filteredRows.filter((r) => picked.has(r.id) && r.canAct),
    [filteredRows, picked]
  );
  const actionableRows = useMemo(() => filteredRows.filter((r) => r.canAct), [filteredRows]);
  // Selection is a MODE, entered by long-pressing a row, not tick boxes that live on every row.
  // Deriving it from the selection itself is what makes unticking the last row leave the mode —
  // there is no way to be stranded in an empty selection offering "Approve 0".
  const selecting = selectedRows.length > 0;

  const toggle = useCallback((id: string) => {
    setPicked((prev) => {
      const next = new Set(prev);
      if (!next.delete(id)) next.add(id);
      return next;
    });
  }, []);

  useEffect(() => { setPicked(new Set()); }, [filter]);

  // Hardware Back cancels the selection before it leaves the screen. Without this a stray back
  // press throws away a whole backlog of ticks — the classic multi-select bug.
  useEffect(() => {
    if (!selecting) return undefined;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      setPicked(new Set());
      return true;
    });
    return () => sub.remove();
  }, [selecting]);

  // Each kind goes back to its own endpoint — the one place the two sources diverge again.
  const sendDecision = (item: QueueItem, action: 'approve' | 'reject', reason?: string): Promise<void> =>
    item.kind === 'approval'
      ? updateApprovalDecision(item.sourceId, action, reason).then(() => undefined)
      : decideRegularization(item.sourceId, action, reason).then(() => undefined);

  const submitDecision = (item: QueueItem, action: 'approve' | 'reject', reason?: string) => {
    setBusyId(item.id);
    sendDecision(item, action, reason)
      .then(() => {
        showToast(action === 'approve' ? 'Approval recorded' : 'Request rejected');
        setRejecting(null);
        setNote('');
        setSelected(null);
        load();
      })
      .catch((error) => showToast(error instanceof ApiError ? error.message : 'Could not record the decision'))
      .finally(() => setBusyId(null));
  };

  const decide = (item: QueueItem, action: 'approve' | 'reject') => {
    if (action === 'reject') {
      setRejecting(item);
      setNote('');
      return;
    }
    Alert.alert('Approve this request?', item.title, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Approve', onPress: () => submitDecision(item, 'approve') },
    ]);
  };

  // Sequential, so the server applies them in a defined order and one failure does not cancel the
  // rest. The toast reports what actually landed rather than assuming all of it did.
  const decideMany = async (list: QueueItem[], action: 'approve' | 'reject', reason?: string) => {
    setBusyId('bulk');
    let done = 0;
    for (const item of list) {
      try {
        await sendDecision(item, action, reason);
        done += 1;
      } catch {
        /* keep going — the count below reports the shortfall */
      }
    }
    setBusyId(null);
    setPicked(new Set());
    setRejecting(null);
    setNote('');
    const verb = action === 'approve' ? 'Approved' : 'Rejected';
    showToast(done === list.length ? `${verb} ${done}` : `${verb} ${done} of ${list.length}`);
    load();
  };

  const confirmMany = (action: 'approve' | 'reject') => {
    const list = selectedRows;
    if (action === 'reject') {
      setRejecting('bulk');
      setNote('');
      return;
    }
    Alert.alert(
      `Approve ${list.length} requests?`,
      list.map((r) => r.title).join('\n'),
      [
        { text: 'Cancel', style: 'cancel' },
        { text: `Approve ${list.length}`, onPress: () => { void decideMany(list, 'approve'); } },
      ]
    );
  };

  if (approvals === null) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  const bulkBusy = busyId === 'bulk';

  return (
    <>
      {/* The bar is the mode: normally the screen's title and Create; inside a selection it
          becomes the count, the way out, and Select all, on a tinted ground so the changed
          state reads without a banner. */}
      {selecting ? (
        <View style={styles.selHeader}>
          <Pressable
            onPress={() => setPicked(new Set())}
            accessibilityRole="button"
            accessibilityLabel="Leave selection"
            style={styles.selClose}
          >
            <X size={20} color={colors.primary} strokeWidth={2.4} />
          </Pressable>
          <Text style={styles.selCount}>{selectedRows.length} selected</Text>
          <Pressable
            onPress={() => setPicked(new Set(actionableRows.map((r) => r.id)))}
            accessibilityRole="button"
            accessibilityLabel="Select all requests you can decide"
            style={styles.selAll}
          >
            <Text style={styles.selAllText}>Select all</Text>
          </Pressable>
        </View>
      ) : showTitle ? (
        <View style={styles.header}>
          <Text style={styles.headerTitle}>Approvals</Text>
          {/* No "New request" (owner 2026-10-07): manual approval requests raised in the app are
              stopped for now. Requests already raised still show here and can be decided. */}
        </View>
      ) : null}

      {/* Segmented control — one white card slides across a grey track. */}
      <View style={styles.segment}>
        {TABS.map((tab) => {
          const on = filter === tab.key;
          return (
            <Pressable
              key={tab.key}
              onPress={() => setFilter(tab.key)}
              accessibilityRole="tab"
              accessibilityState={{ selected: on }}
              style={[styles.segmentTab, on && styles.segmentTabOn]}
            >
              <Text style={[styles.segmentText, on && styles.segmentTextOn]}>{tab.label}</Text>
              {tab.key === 'pending' && pendingCount > 0 ? (
                <View style={styles.segmentBadge}>
                  <Text style={styles.segmentBadgeText}>{pendingCount > 99 ? '99+' : pendingCount}</Text>
                </View>
              ) : null}
            </Pressable>
          );
        })}
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        {groups.length ? (
          groups.map((group) => (
            <View key={group.userId}>
              {/* Requester header — whose asks this block is. */}
              <View style={styles.groupHeader}>
                <AvatarBadge name={group.name} size={32} />
                <Text style={styles.groupName} numberOfLines={1}>
                  {group.name}
                  {group.branch ? <Text style={styles.groupBranch}> · {group.branch}</Text> : null}
                </Text>
                <Text style={styles.groupCount}>
                  {group.rows.length} request{group.rows.length === 1 ? '' : 's'}
                </Text>
              </View>
              {group.rows.map((row) => (
                <ApprovalRow
                  key={row.id}
                  item={row.item}
                  selecting={selecting}
                  selected={picked.has(row.id)}
                  busy={busyId === row.id || bulkBusy}
                  // Only an approval has a level-by-level chain to open; a time correction is the
                  // whole story already, so its row body is not a link to anywhere.
                  onPress={() => {
                    if (row.item.kind !== 'approval') return;
                    const record = (approvals ?? []).find((a) => a.id === row.item.sourceId);
                    if (record) setSelected(record);
                  }}
                  onToggle={() => toggle(row.id)}
                  onDecide={decide}
                />
              ))}
            </View>
          ))
        ) : (
          <View style={styles.emptyState}>
            <View style={styles.emptyIcon}>
              <CheckCircle2 size={34} color={colors.primary} />
            </View>
            <Text style={styles.heading}>{loadError ? 'Something went wrong' : 'No approval requests'}</Text>
            <Text style={styles.subheading}>
              {loadError
                ? 'We could not load your approvals right now. Please try again.'
                : filter === 'all'
                ? 'There are currently no approval requests assigned to you.'
                : `There are no ${statusMeta(filter as ApprovalStatus).label.toLowerCase()} approval requests at the moment.`}
            </Text>
          </View>
        )}
      </ScrollView>

      {/* Bulk bar — the only way to act while selecting. The count lives in the header, so both
          buttons get the full width instead of competing with a label. */}
      {selecting ? (
        <View style={styles.bulkBar}>
          <Pressable
            disabled={bulkBusy}
            onPress={() => confirmMany('reject')}
            accessibilityRole="button"
            style={[styles.bulkReject, bulkBusy && styles.btnBusy]}
          >
            <Text style={styles.bulkRejectText}>Reject {selectedRows.length}</Text>
          </Pressable>
          <Pressable
            disabled={bulkBusy}
            onPress={() => confirmMany('approve')}
            accessibilityRole="button"
            style={[styles.bulkApprove, bulkBusy && styles.btnBusy]}
          >
            <Text style={styles.bulkApproveText}>
              {bulkBusy ? 'Working…' : `Approve ${selectedRows.length}`}
            </Text>
          </Pressable>
        </View>
      ) : null}

      {/* Reject-with-reason. The note is required — the time-correction endpoint rejects without
          one, and it is what goes back to the person who asked. One note covers a bulk rejection:
          the reviewer is refusing them for the same stated reason. */}
      <Modal visible={!!rejecting} transparent animationType="fade" statusBarTranslucent onRequestClose={() => setRejecting(null)}>
        <Pressable onPress={() => setRejecting(null)} style={styles.modalScrim}>
          <Pressable onPress={() => undefined} style={styles.modalCard}>
            <View style={styles.modalHead}>
              <Text style={styles.modalTitle}>
                {rejecting === 'bulk' ? `Reject ${selectedRows.length} requests` : 'Reject request'}
              </Text>
              <Pressable onPress={() => setRejecting(null)} hitSlop={8} style={styles.modalClose}>
                <X size={16} color={colors.coolText} />
              </Pressable>
            </View>
            <Text style={styles.modalHint}>
              {rejecting === 'bulk'
                ? 'The same reason goes back to everyone selected.'
                : `${rejecting?.personName ?? 'Requester'} · ${rejecting?.title ?? ''} — the reason goes back to them.`}
            </Text>
            <TextInput
              value={note}
              onChangeText={setNote}
              placeholder="Why is this refused?"
              placeholderTextColor={colors.coolText3}
              multiline
              maxLength={300}
              autoFocus
              style={styles.modalInput}
            />
            <Pressable
              disabled={!note.trim() || busyId !== null}
              onPress={() => {
                if (!rejecting) return;
                if (rejecting === 'bulk') void decideMany(selectedRows, 'reject', note.trim());
                else submitDecision(rejecting, 'reject', note.trim());
              }}
              style={[styles.modalSubmit, !note.trim() && styles.modalSubmitOff]}
            >
              <Text style={[styles.modalSubmitText, !note.trim() && styles.modalSubmitTextOff]}>
                {busyId !== null ? 'Rejecting…' : 'Reject with reason'}
              </Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>

      <ApprovalDetail
        record={selected}
        visible={!!selected}
        busy={busyId === `approval:${selected?.id}`}
        onClose={() => setSelected(null)}
        onDecision={(action) => selected && decide(approvalToItem(selected), action)}
      />
    </>
  );
}

export default function ApprovalsScreen() {
  // ERP approvals (owner 2026-10-07): a person the ERP recognises gets the ERP's approval section
  // here — Entries, Requests, Credit, HR, Month Close — next to the app's own requests. Everyone else
  // sees the app's requests exactly as before.
  const erp = useErpAccess();
  const [mode, setMode] = useState<'erp' | 'app'>('erp');
  if (erp.state === 'checking') {
    return (
      <SafeAreaView style={styles.screen}>
        <View style={styles.header}><Text style={styles.headerTitle}>Approvals</Text></View>
        <ActivityIndicator style={{ marginTop: 40 }} color={colors.primary} />
      </SafeAreaView>
    );
  }
  if (erp.state !== 'ready') {
    // The header swaps between the screen's own bar and the selection bar, and only Inbox knows
    // which is showing, so it renders both.
    return (
      <SafeAreaView style={styles.screen}>
        <Inbox />
      </SafeAreaView>
    );
  }
  return (
    <SafeAreaView style={styles.screen}>
      <View style={styles.header}><Text style={styles.headerTitle}>Approvals</Text></View>
      <View style={[styles.segment, { marginBottom: 10 }]}>
        {([['erp', 'ERP approvals'], ['app', 'App requests']] as const).map(([key, label]) => {
          const on = mode === key;
          return (
            <Pressable key={key} onPress={() => setMode(key)} accessibilityRole="tab" accessibilityState={{ selected: on }} style={[styles.segmentTab, on && styles.segmentTabOn]}>
              <Text style={[styles.segmentText, on && styles.segmentTextOn]}>{label}</Text>
            </Pressable>
          );
        })}
      </View>
      {mode === 'erp' ? <ErpApprovalsView me={erp.me} /> : <Inbox showTitle={false} includeCorrections={false} />}
    </SafeAreaView>
  );
}

const styles = {
  screen: { flex: 1, backgroundColor: colors.card },
  header: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 8,
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 10,
    backgroundColor: colors.card,
  },
  headerCopy: { flex: 1 },
  headerTitle: { flex: 1, color: colors.ink, fontSize: 20, fontWeight: '800' as const },
  headerSubtitle: { color: colors.coolText, fontSize: 12.5, marginTop: 3 },
  addButton: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    gap: 5,
    height: 36,
    paddingHorizontal: 12,
    borderRadius: 10,
    backgroundColor: colors.primary,
  },
  addButtonText: { color: '#fff', fontSize: 13, fontWeight: '700' as const },

  // Selection bar — same 60px band as the header, tinted so the mode is unmistakable.
  selHeader: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 10,
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 10,
    backgroundColor: colors.primarySoft,
  },
  selClose: {
    width: 36, height: 36, borderRadius: 10,
    alignItems: 'center' as const, justifyContent: 'center' as const,
  },
  selCount: { flex: 1, color: colors.primary, fontSize: 17, fontWeight: '800' as const },
  selAll: {
    height: 34, paddingHorizontal: 12, borderRadius: 9,
    borderWidth: 1, borderColor: colors.primary,
    alignItems: 'center' as const, justifyContent: 'center' as const,
  },
  selAllText: { color: colors.primary, fontSize: 12.5, fontWeight: '700' as const },

  // Segmented control (approved Time-corrections treatment): one white card on a grey track.
  segment: {
    flexDirection: 'row' as const,
    marginHorizontal: 16,
    marginBottom: 12,
    backgroundColor: colors.coolMuted,
    borderRadius: 12,
    padding: 4,
    gap: 4,
  },
  // Four tabs in 390px: the type and the badge are a shade tighter than the three-tab
  // Time-corrections control so "Approved" and "Rejected" keep their own space.
  segmentTab: {
    flex: 1,
    height: 38,
    borderRadius: 9,
    paddingHorizontal: 2,
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    gap: 4,
  },
  segmentTabOn: { backgroundColor: colors.card },
  segmentText: { color: colors.coolText, fontSize: 12.5, fontWeight: '600' as const },
  segmentTextOn: { color: colors.primary, fontWeight: '800' as const },
  segmentBadge: {
    minWidth: 16,
    height: 16,
    paddingHorizontal: 4,
    borderRadius: 8,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    backgroundColor: colors.primary,
  },
  segmentBadgeText: { color: '#fff', fontSize: 10, fontWeight: '700' as const },

  // Requester block header.
  groupHeader: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 10,
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: colors.surfaceSubtle,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: colors.coolDivider,
  },
  groupName: { flex: 1, color: colors.ink, fontSize: 14, fontWeight: '700' as const },
  groupBranch: { color: colors.coolText, fontWeight: '500' as const },
  groupCount: { color: colors.coolText, fontSize: 12 },

  checkbox: {
    width: 20,
    height: 20,
    marginTop: 2,
    borderRadius: 6,
    borderWidth: 1.5,
    borderColor: colors.borderStrong,
    backgroundColor: colors.card,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
  checkboxOn: { borderWidth: 0, backgroundColor: colors.primary },

  agePill: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6, backgroundColor: colors.coolMuted },
  agePillStale: { backgroundColor: colors.warnSoft },
  ageText: { color: colors.coolText, fontSize: 11, fontWeight: '700' as const },
  ageTextStale: { color: colors.warn },

  // The actions get their own row, right-aligned to the same gutter the text ends on.
  rowActions: {
    flexDirection: 'row' as const,
    justifyContent: 'flex-end' as const,
    alignItems: 'center' as const,
    gap: 8,
    marginTop: 12,
  },
  // Both buttons take the SAME width. "Reject" and "Approve" are different lengths, so letting each
  // hug its text made every row's pair a slightly different size — the loudest part of the raggedness.
  rejectBtn: {
    height: 36,
    minWidth: 96,
    paddingHorizontal: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.dangerEdge,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
  rejectText: { color: colors.dangerText, fontSize: 13, fontWeight: '700' as const },
  approveBtn: {
    height: 36,
    minWidth: 96,
    paddingHorizontal: 12,
    borderRadius: 10,
    backgroundColor: colors.primary,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
  approveText: { color: '#fff', fontSize: 13, fontWeight: '700' as const },
  btnBusy: { opacity: 0.5 },

  bulkBar: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 10,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderTopWidth: 1,
    borderTopColor: colors.coolDivider,
    backgroundColor: colors.card,
  },
  bulkReject: {
    flex: 1,
    height: 44,
    paddingHorizontal: 18,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.dangerEdge,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
  bulkRejectText: { color: colors.dangerText, fontSize: 14, fontWeight: '700' as const },
  bulkApprove: {
    flex: 1,
    height: 44,
    paddingHorizontal: 18,
    borderRadius: 12,
    backgroundColor: colors.primary,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
  bulkApproveText: { color: '#fff', fontSize: 14, fontWeight: '700' as const },

  content: { paddingBottom: 24, flexGrow: 1 },
  heading: { color: colors.ink, fontSize: 17, fontWeight: '800' as const },
  subheading: { color: colors.coolText, fontSize: 12.5, marginTop: 3, textAlign: 'center' as const },

  hierarchyHeading: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'space-between' as const,
    gap: 10,
    paddingHorizontal: 2,
    marginTop: 4,
  },
  sectionTitle: { color: colors.ink, fontSize: 15, fontWeight: '800' as const },
  sectionHint: { color: colors.coolText, fontSize: 12, lineHeight: 17, marginTop: 1 },

  addLevelHeaderBtn: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 4,
    paddingHorizontal: 11,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: colors.primarySoft,
  },
  addLevelHeaderBtnText: { color: colors.primary, fontSize: 12, fontWeight: '800' as const },

  sectionCard: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.coolDivider,
    borderRadius: 18,
    padding: 16,
    gap: 10,
  },
  label: { color: colors.ink, fontSize: 12.5, fontWeight: '700' as const, marginTop: 2 },
  required: { color: colors.danger },
  input: {
    backgroundColor: colors.coolBg,
    borderWidth: 1,
    borderColor: colors.coolDivider,
    borderRadius: 13,
    minHeight: 46,
    paddingHorizontal: 13,
    color: colors.ink,
    fontSize: 14,
  },
  multiline: { minHeight: 96, paddingTop: 11 },

  levelCard: {
    backgroundColor: colors.card,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.coolDivider,
    padding: 14,
    gap: 10,
  },
  levelCardHeader: {
    flexDirection: 'row' as const,
    justifyContent: 'space-between' as const,
    alignItems: 'center' as const,
  },
  levelBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
    backgroundColor: colors.coolMuted,
  },
  levelBadgeText: { color: colors.ink, fontSize: 13, fontWeight: '800' as const },
  deleteLevelBtn: {
    padding: 6,
    borderRadius: 8,
    backgroundColor: colors.danger + '10',
  },

  selectedApproverItem: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    backgroundColor: colors.coolBg,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.coolDivider,
    padding: 10,
  },
  selectedApproverName: { color: colors.ink, fontSize: 13.5, fontWeight: '800' as const },
  selectedApproverRole: { color: colors.coolText, fontSize: 11, marginTop: 1 },
  removeApproverBtn: {
    padding: 6,
    borderRadius: 12,
    backgroundColor: colors.coolMuted,
  },

  modeContainer: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 8,
    marginTop: 2,
  },
  modeCaption: { color: colors.coolText, fontSize: 11.5, fontWeight: '700' as const },
  modeChip: {
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: 8,
    backgroundColor: colors.coolBg,
    borderWidth: 1,
    borderColor: colors.coolDivider,
  },
  modeChipActive: {
    backgroundColor: colors.primarySoft,
    borderColor: colors.primary,
  },
  modeChipText: { color: colors.coolText, fontSize: 11, fontWeight: '700' as const },
  modeChipTextActive: { color: colors.primary, fontWeight: '800' as const },

  searchWrap: { gap: 6 },
  searchBox: {
    minHeight: 44,
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 8,
    paddingHorizontal: 12,
    borderRadius: 12,
    backgroundColor: colors.coolBg,
    borderWidth: 1,
    borderColor: colors.coolDivider,
  },
  searchInput: { flex: 1, color: colors.ink, fontSize: 13.5, paddingVertical: 8 },

  suggestionsBox: {
    backgroundColor: colors.card,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.coolDivider,
    padding: 10,
    gap: 6,
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 3,
  },
  suggestionsHeader: {
    flexDirection: 'row' as const,
    justifyContent: 'space-between' as const,
    alignItems: 'center' as const,
    paddingBottom: 6,
    borderBottomWidth: 1,
    borderBottomColor: colors.coolDivider,
  },
  suggestionsHeaderTitle: { color: colors.coolText, fontSize: 11, fontWeight: '800' as const, textTransform: 'uppercase' as const },
  closeSuggestionsText: { color: colors.primary, fontSize: 11, fontWeight: '800' as const },

  suggestionRow: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    paddingVertical: 8,
    paddingHorizontal: 6,
    borderBottomWidth: 1,
    borderBottomColor: colors.coolDivider,
  },
  suggestionName: { color: colors.ink, fontSize: 13, fontWeight: '700' as const },
  suggestionMeta: { color: colors.coolText, fontSize: 11, marginTop: 1 },
  emptySuggestionText: { color: colors.coolText, paddingVertical: 14, textAlign: 'center' as const, fontSize: 12 },

  addAnotherBtn: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 6,
    alignSelf: 'flex-start' as const,
    paddingVertical: 5,
    paddingHorizontal: 10,
    borderRadius: 8,
    backgroundColor: colors.primarySoft,
  },
  addAnotherBtnText: { color: colors.primary, fontSize: 11.5, fontWeight: '800' as const },

  addLevelDashedBtn: {
    minHeight: 46,
    borderWidth: 1.5,
    borderStyle: 'dashed' as const,
    borderColor: colors.primary + '55',
    borderRadius: 14,
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    gap: 7,
    backgroundColor: colors.primarySoft + '40',
  },
  addLevelDashedBtnText: { color: colors.primary, fontSize: 13, fontWeight: '800' as const },

  primaryButton: {
    height: 50,
    borderRadius: 14,
    flexDirection: 'row' as const,
    gap: 8,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    backgroundColor: colors.primary,
    marginTop: 4,
    shadowColor: colors.primaryDark,
    shadowOpacity: 0.2,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 4,
  },
  primaryButtonDisabled: { opacity: 0.5 },
  primaryButtonText: { color: '#fff', fontSize: 14, fontWeight: '800' as const },
  footerHint: {
    color: colors.coolText,
    fontSize: 11.5,
    lineHeight: 17,
    textAlign: 'center' as const,
    paddingHorizontal: 20,
  },

  filterBar: { gap: 8, paddingVertical: 2 },
  filterChip: {
    paddingHorizontal: 13,
    height: 34,
    borderRadius: 999,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.coolDivider,
  },
  filterChipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  filterChipText: { color: colors.coolText, fontSize: 12, fontWeight: '700' as const },
  filterChipTextActive: { color: '#fff' },

  // Flat full-width row on a hairline, per the approved queue — not a floating card.
  // One spacing scale: 14px row padding, 5px between text lines, 12px before the action row.
  // A single `gap` spaced text and buttons identically, so nothing read as grouped.
  approvalRow: {
    paddingHorizontal: 16,
    paddingVertical: 14,
    backgroundColor: colors.card,
    borderBottomWidth: 1,
    borderBottomColor: colors.coolMuted,
    flexDirection: 'row' as const,
    alignItems: 'flex-start' as const,
    gap: 12,
  },
  approvalRowSelected: { backgroundColor: colors.rowUnread },
  rowMain: { flex: 1, minWidth: 0 },
  rowTop: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 10 },
  avatarBadge: {
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
  avatarText: { fontWeight: '800' as const },
  rowBody: { flex: 1, minWidth: 0, gap: 4 },
  cardTop: { flexDirection: 'row' as const, justifyContent: 'space-between' as const, alignItems: 'center' as const },
  cardTitle: { flex: 1, minWidth: 0, color: colors.ink, fontSize: 15, fontWeight: '700' as const },
  cardDate: { color: colors.coolText, fontSize: 11.5 },
  rowMeta: { color: colors.textBody, fontSize: 13, marginTop: 5 },
  rowChain: { color: colors.coolText },
  rowWarn: { color: colors.warn, fontWeight: '700' as const },
  rowQuote: { color: colors.coolText, fontSize: 12.5, marginTop: 5 },

  modalScrim: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'center' as const, padding: 24 },
  modalCard: { backgroundColor: colors.card, borderRadius: 20, padding: 18 },
  modalHead: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'space-between' as const,
    marginBottom: 6,
  },
  modalTitle: { color: colors.ink, fontSize: 16, fontWeight: '700' as const },
  modalClose: {
    width: 30, height: 30, borderRadius: 15,
    alignItems: 'center' as const, justifyContent: 'center' as const,
    backgroundColor: colors.coolMuted,
  },
  modalHint: { color: colors.coolText, fontSize: 12.5, marginBottom: 10 },
  modalInput: {
    minHeight: 64, borderRadius: 14, borderWidth: 1, borderColor: colors.coolDivider,
    backgroundColor: colors.coolBg, paddingHorizontal: 12, paddingVertical: 10,
    color: colors.ink, fontSize: 13.5, textAlignVertical: 'top' as const, marginBottom: 12,
  },
  modalSubmit: {
    height: 48, borderRadius: 999,
    alignItems: 'center' as const, justifyContent: 'center' as const,
    backgroundColor: colors.danger,
  },
  modalSubmitOff: { backgroundColor: colors.coolMuted },
  modalSubmitText: { color: '#fff', fontSize: 14, fontWeight: '700' as const },
  modalSubmitTextOff: { color: colors.coolText3 },
  rowMetaMuted: { color: colors.coolText3, fontSize: 10.5 },
  rowRight: { alignItems: 'flex-end' as const, gap: 8, flexShrink: 0 },
  statusPill: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 999 },
  statusText: { fontSize: 10.5, fontWeight: '800' as const },

  emptyState: { alignItems: 'center' as const, paddingTop: 48 },
  emptyIcon: {
    width: 72,
    height: 72,
    borderRadius: 36,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    backgroundColor: colors.primarySoft,
    marginBottom: 12,
  },

  detailBackdrop: { flex: 1, justifyContent: 'flex-end' as const, backgroundColor: 'rgba(12,14,20,0.45)' },
  detailSheet: {
    maxHeight: '88%' as const,
    backgroundColor: colors.card,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingTop: 10,
  },
  detailHandle: {
    alignSelf: 'center' as const,
    width: 38,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.coolDivider,
    marginBottom: 8,
  },
  detailHeader: {
    flexDirection: 'row' as const,
    alignItems: 'flex-start' as const,
    paddingHorizontal: 18,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.coolDivider,
  },
  detailHeaderInfo: { flex: 1, paddingRight: 8 },
  detailTitle: { color: colors.ink, fontSize: 18, fontWeight: '800' as const },
  detailSubtitle: { color: colors.coolText, fontSize: 12.5, marginTop: 4 },
  closeButton: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    backgroundColor: colors.coolMuted,
  },
  detailContent: { padding: 18, gap: 13, paddingBottom: 30 },
  detailSummaryCard: {
    backgroundColor: colors.coolBg,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.coolDivider,
    padding: 10,
  },
  detailSummaryRow: { flexDirection: 'row' as const, justifyContent: 'space-between' as const, gap: 8 },
  detailSummaryItem: { flex: 1, gap: 6 },
  summaryLabel: { color: colors.coolText, fontSize: 10.5, textTransform: 'uppercase' as const, letterSpacing: 0.4 },
  summaryValue: { color: colors.ink, fontSize: 12.5, fontWeight: '700' as const },
  detailSectionTitle: { color: colors.ink, fontSize: 14, fontWeight: '800' as const, marginTop: 3 },
  detailText: { color: colors.coolText, fontSize: 13.5, lineHeight: 20 },

  detailLevelContainer: {
    backgroundColor: colors.coolBg,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.coolDivider,
    padding: 10,
    gap: 8,
  },
  detailLevelHeader: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'space-between' as const,
    paddingBottom: 6,
    borderBottomWidth: 1,
    borderBottomColor: colors.coolDivider,
  },
  detailLevelLabel: { color: colors.ink, fontSize: 13, fontWeight: '800' as const },

  hierarchyRow: {
    minHeight: 42,
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 6,
    paddingVertical: 4,
  },
  hierarchyDot: {
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    backgroundColor: colors.primarySoft,
  },
  hierarchyLabel: { color: colors.coolText, fontSize: 12, width: 90 },
  hierarchyValue: { color: colors.ink, fontSize: 12.5, fontWeight: '700' as const },
  decisionNoteText: { color: colors.orange, fontSize: 11, fontStyle: 'italic' as const, marginTop: 2 },

  inlineStatus: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 999, marginLeft: 6 },
  inlineStatusText: { fontSize: 9.5, fontWeight: '800' as const },

  detailActions: { flexDirection: 'row' as const, gap: 8, marginTop: 6 },
  detailAction: {
    flex: 1,
    height: 46,
    borderRadius: 13,
    flexDirection: 'row' as const,
    gap: 7,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
  detailReject: { borderWidth: 1, borderColor: colors.danger + '55', backgroundColor: colors.danger + '0D' },
  detailActionText: { fontSize: 13, fontWeight: '800' as const },

  center: { flex: 1, alignItems: 'center' as const, justifyContent: 'center' as const, padding: 24 },
};
