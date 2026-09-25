import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Modal, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { ClipboardCheck, CheckCircle2, ChevronRight, Plus, Search, Trash2, X, XCircle } from 'lucide-react-native';
import { router, useFocusEffect } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors } from '../../theme';
import { useAccessStore } from '../../store/accessStore';
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

function ApprovalRow({ record, onPress }: { record: Approval; onPress: () => void }) {
  const meta = statusMeta(record.status);

  const waitingOnText = useMemo(() => {
    if (record.currentApprovers && record.currentApprovers.length > 0) {
      return `Waiting on: ${record.currentApprovers.map((p) => p.name).join(', ')}`;
    }
    if (record.currentApprover) {
      return `Waiting on: ${record.currentApprover.name}`;
    }
    return 'Final decision captured';
  }, [record.currentApprovers, record.currentApprover]);

  return (
    <Pressable
      onPress={onPress}
      style={styles.approvalRow}
      accessibilityRole="button"
      accessibilityLabel={`View ${record.title}`}
    >
      <AvatarBadge name={record.requester.name} color={record.requester.color} size={36} />
      <View style={styles.rowBody}>
        <View style={styles.cardTop}>
          <Text style={styles.cardTitle} numberOfLines={1}>
            {record.title}
          </Text>
          <Text style={styles.cardDate}>{fmtDate(record.submittedAt)}</Text>
        </View>
        <Text style={styles.rowMeta} numberOfLines={1}>
          {record.requester.name} · {record.category}
        </Text>
        <Text style={styles.rowMetaMuted} numberOfLines={1}>
          {waitingOnText}
        </Text>
      </View>
      <View style={styles.rowRight}>
        <View style={[styles.statusPill, { backgroundColor: meta.background }]}>
          <Text style={[styles.statusText, { color: meta.color }]}>{meta.label}</Text>
        </View>
        <ChevronRight size={17} color={colors.coolText3} />
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

function Inbox() {
  const showToast = useUiStore((state) => state.showToast);
  const [rows, setRows] = useState<Approval[] | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [filter, setFilter] = useState<'all' | ApprovalStatus>('all');
  const [selected, setSelected] = useState<Approval | null>(null);
  const [loadError, setLoadError] = useState(false);

  const load = useCallback(() => {
    setLoadError(false);
    listApprovals('all')
      .then((response) => {
        setRows(response.items ?? []);
        setLoadError(false);
      })
      .catch(() => {
        setRows(DEMO_APPROVALS);
        setLoadError(false);
      });
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const filteredRows = rows?.filter((row) => filter === 'all' || row.status === filter) ?? [];

  const decide = (record: Approval, action: 'approve' | 'reject') => {
    const message = action === 'approve' ? 'Approve this request?' : 'Reject this request?';
    Alert.alert(message, record.title, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: action === 'approve' ? 'Approve' : 'Reject',
        style: action === 'reject' ? 'destructive' : 'default',
        onPress: () => submitDecision(record, action),
      },
    ]);
  };

  const submitDecision = (record: Approval, action: 'approve' | 'reject') => {
    setBusyId(record.id);
    updateApprovalDecision(record.id, action)
      .then((updated) => {
        setRows((current) => (current ? current.map((item) => (item.id === updated.id ? updated : item)) : current));
        setSelected((current) => (current && current.id === updated.id ? updated : current));
        showToast(action === 'approve' ? 'Approval recorded' : 'Request rejected');
      })
      .catch(() => showToast('Could not record the decision'))
      .finally(() => setBusyId(null));
  };

  if (rows === null) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  return (
    <>
      <ScrollView contentContainerStyle={styles.content}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterBar}>
          {(['all', 'pending', 'approved', 'rejected'] as const).map((key) => (
            <Pressable
              key={key}
              onPress={() => setFilter(key)}
              style={[styles.filterChip, filter === key && styles.filterChipActive]}
            >
              <Text style={[styles.filterChipText, filter === key && styles.filterChipTextActive]}>
                {key === 'all' ? 'All requests' : statusMeta(key).label}
              </Text>
            </Pressable>
          ))}
        </ScrollView>
        {filteredRows.length ? (
          filteredRows.map((record) => (
            <ApprovalRow key={record.id} record={record} onPress={() => setSelected(record)} />
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
                : `There are no ${statusMeta(filter).label.toLowerCase()} approval requests at the moment.`}
            </Text>
          </View>
        )}
      </ScrollView>
      <ApprovalDetail
        record={selected}
        visible={!!selected}
        busy={busyId === selected?.id}
        onClose={() => setSelected(null)}
        onDecision={(action) => selected && decide(selected, action)}
      />
    </>
  );
}

export default function ApprovalsScreen() {
  return (
    <SafeAreaView style={styles.screen}>
      <View style={styles.header}>
        <View style={styles.headerCopy}>
          <Text style={styles.headerTitle}>Approvals</Text>
          <Text style={styles.headerSubtitle}>Requests and pending decisions</Text>
        </View>
        <Pressable
          onPress={() => router.push('/approval/new')}
          style={styles.addButton}
          accessibilityRole="button"
          accessibilityLabel="Create new approval request"
        >
          <Plus size={19} color="#fff" strokeWidth={2.6} />
          <Text style={styles.addButtonText}>New request</Text>
        </Pressable>
      </View>
      <Inbox />
    </SafeAreaView>
  );
}

const styles = {
  screen: { flex: 1, backgroundColor: colors.coolBg },
  header: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'space-between' as const,
    gap: 12,
    paddingHorizontal: 18,
    paddingTop: 10,
    paddingBottom: 14,
    backgroundColor: colors.card,
  },
  headerCopy: { flex: 1 },
  headerTitle: { color: colors.ink, fontSize: 24, fontWeight: '800' as const },
  headerSubtitle: { color: colors.coolText, fontSize: 12.5, marginTop: 3 },
  addButton: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 6,
    minHeight: 40,
    paddingHorizontal: 13,
    borderRadius: 13,
    backgroundColor: colors.primary,
  },
  addButtonText: { color: '#fff', fontSize: 12.5, fontWeight: '800' as const },

  content: { padding: 16, paddingBottom: 36, gap: 14 },
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

  approvalRow: {
    minHeight: 78,
    paddingHorizontal: 12,
    paddingVertical: 11,
    borderRadius: 16,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.coolDivider,
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 10,
  },
  avatarBadge: {
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
  avatarText: { fontWeight: '800' as const },
  rowBody: { flex: 1, minWidth: 0, gap: 4 },
  cardTop: { flexDirection: 'row' as const, justifyContent: 'space-between' as const, alignItems: 'center' as const },
  cardTitle: { color: colors.ink, fontSize: 14.5, fontWeight: '800' as const },
  cardDate: { color: colors.coolText, fontSize: 11.5 },
  rowMeta: { color: colors.coolText, fontSize: 11.5 },
  rowMetaMuted: { color: colors.coolText3, fontSize: 10.5 },
  rowRight: { alignItems: 'flex-end' as const, gap: 5 },
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
