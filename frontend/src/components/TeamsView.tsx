import React, { useState, useEffect } from 'react';
import { 
  Users, 
  Trash2, 
  Plus,
  ArrowRight,
  ShieldAlert,
} from 'lucide-react';
import { supabase } from '../services/supabase';
import { useAuth } from '../context/useAuth';

interface Team {
  id: string;
  name: string;
  created_at: string;
  role?: 'admin' | 'editor' | 'viewer';
}

interface TeamMember {
  id: string;
  user_id: string;
  role: 'admin' | 'editor' | 'viewer';
  created_at: string;
  full_name?: string;
  email?: string;
}

const TeamsView: React.FC = () => {
  const { user } = useAuth();
  const [teams, setTeams] = useState<Team[]>([]);
  const [selectedTeam, setSelectedTeam] = useState<Team | null>(null);
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newTeamName, setNewTeamName] = useState('');
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState<'admin' | 'editor' | 'viewer'>('viewer');
  const [actionPending, setActionPending] = useState(false);

  useEffect(() => {
    fetchTeams();
  }, []);

  useEffect(() => {
    if (selectedTeam) {
      fetchMembers(selectedTeam.id);
    }
  }, [selectedTeam]);

  const fetchTeams = async () => {
    setLoading(true);
    try {
      // Fetch teams where user is a member
      const { data, error } = await supabase
        .from('teams')
        .select(`
          *,
          team_members!inner(role)
        `);

      if (error) throw error;
      
      const formattedTeams = data.map(t => ({
        ...t,
        role: t.team_members[0].role
      }));
      
      setTeams(formattedTeams);
      if (formattedTeams.length > 0 && !selectedTeam) {
        setSelectedTeam(formattedTeams[0]);
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const fetchMembers = async (teamId: string) => {
    try {
      const { data, error } = await supabase
        .from('team_members_with_profiles')
        .select('*')
        .eq('team_id', teamId);

      if (error) throw error;

      const formattedMembers = data.map(m => ({
        ...m,
        full_name: m.full_name,
        email: m.email
      }));

      setMembers(formattedMembers);
    } catch (err: any) {
      setError(err.message);
    }
  };

  const createTeam = async () => {
    if (!newTeamName.trim()) return;
    setActionPending(true);
    try {
      const { error } = await supabase
        .from('teams')
        .insert([{ name: newTeamName, created_by: user?.id }])
        .select()
        .single();

      if (error) throw error;

      setNewTeamName('');
      setShowCreateModal(false);
      fetchTeams();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setActionPending(false);
    }
  };

  const inviteMember = async () => {
    if (!selectedTeam || !inviteEmail.trim()) return;
    setActionPending(true);
    try {
      // In a real app, we'd send an email or look up by email.
      // For this demo, we'll assume we can look up by email in profiles.
      const { data: userData, error: userError } = await supabase
        .from('profiles')
        .select('id')
        .eq('email', inviteEmail.trim())
        .single();

      if (userError || !userData) {
        throw new Error('User not found. Please ensure the user has signed up.');
      }

      const { error: inviteError } = await supabase
        .from('team_members')
        .insert([{
          team_id: selectedTeam.id,
          user_id: userData.id,
          role: inviteRole
        }]);

      if (inviteError) throw inviteError;

      setInviteEmail('');
      fetchMembers(selectedTeam.id);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setActionPending(false);
    }
  };

  const removeMember = async (memberId: string) => {
    if (!selectedTeam) return;
    if (!window.confirm('Are you sure you want to remove this member?')) return;
    
    try {
      const { error } = await supabase
        .from('team_members')
        .delete()
        .eq('id', memberId);

      if (error) throw error;
      fetchMembers(selectedTeam.id);
    } catch (err: any) {
      setError(err.message);
    }
  };

  const updateMemberRole = async (memberId: string, newRole: string) => {
    try {
      const { error } = await supabase
        .from('team_members')
        .update({ role: newRole })
        .eq('id', memberId);

      if (error) throw error;
      if (selectedTeam) fetchMembers(selectedTeam.id);
    } catch (err: any) {
      setError(err.message);
    }
  };

  return (
    <div className="teams-view">
      <header className="view-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-md)' }}>
          <Users size={32} color="var(--accent)" />
          <div>
            <h2 style={{ margin: 0 }}>Team Management</h2>
            <p style={{ color: 'var(--text-dim)', margin: 0 }}>Manage shared workspaces and permissions</p>
          </div>
        </div>
        <button className="btn btn-primary" onClick={() => setShowCreateModal(true)}>
          <Plus size={18} />
          Create Team
        </button>
      </header>

      {error && (
        <div className="glass-panel alert alert-danger" style={{ marginBottom: 'var(--space-md)' }}>
          <ShieldAlert size={20} />
          <span>{error}</span>
          <button onClick={() => setError(null)} style={{ marginLeft: 'auto', background: 'none', border: 'none', color: 'inherit', cursor: 'pointer' }}>×</button>
        </div>
      )}

      <div className="teams-layout" style={{ display: 'grid', gridTemplateColumns: '280px 1fr', gap: 'var(--space-lg)', marginTop: 'var(--space-lg)' }}>
        {/* Teams List */}
        <div className="teams-list">
          <h3 style={{ fontSize: '0.9rem', textTransform: 'uppercase', color: 'var(--text-dim)', marginBottom: 'var(--space-md)' }}>Your Teams</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-sm)' }}>
            {teams.length === 0 && !loading && (
              <div className="glass-panel" style={{ padding: 'var(--space-md)', textAlign: 'center', color: 'var(--text-dim)' }}>
                No teams yet.
              </div>
            )}
            {teams.map(team => (
              <button 
                key={team.id}
                className={`glass-panel team-item ${selectedTeam?.id === team.id ? 'active' : ''}`}
                onClick={() => setSelectedTeam(team)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: 'var(--space-md)',
                  width: '100%',
                  textAlign: 'left',
                  border: selectedTeam?.id === team.id ? '1px solid var(--accent)' : '1px solid transparent',
                  background: selectedTeam?.id === team.id ? 'rgba(var(--accent-rgb), 0.1)' : 'var(--glass-bg)'
                }}
              >
                <div>
                  <div style={{ fontWeight: 600 }}>{team.name}</div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-dim)' }}>Role: {team.role}</div>
                </div>
                <ArrowRight size={16} style={{ opacity: selectedTeam?.id === team.id ? 1 : 0 }} />
              </button>
            ))}
          </div>
        </div>

        {/* Selected Team Details */}
        <div className="team-details">
          {selectedTeam ? (
            <div className="glass-panel" style={{ padding: 'var(--space-lg)', height: '100%' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 'var(--space-xl)' }}>
                <div>
                  <h3 style={{ margin: 0, fontSize: '1.5rem' }}>{selectedTeam.name}</h3>
                  <p style={{ color: 'var(--text-dim)', fontSize: '0.9rem' }}>Team ID: {selectedTeam.id}</p>
                </div>
                {selectedTeam.role === 'admin' && (
                  <button className="btn btn-glass btn-sm" style={{ color: 'var(--danger)' }}>
                    <Trash2 size={16} />
                    Delete Team
                  </button>
                )}
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 350px', gap: 'var(--space-xl)' }}>
                {/* Members Section */}
                <section>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 'var(--space-lg)' }}>
                    <h4 style={{ margin: 0 }}>Team Members ({members.length})</h4>
                  </div>
                  <div className="members-table" style={{ background: 'rgba(0,0,0,0.2)', borderRadius: '12px', overflow: 'hidden' }}>
                    {members.map(member => (
                      <div key={member.id} style={{ 
                        padding: 'var(--space-md)', 
                        borderBottom: '1px solid rgba(255,255,255,0.05)',
                        display: 'flex',
                        alignItems: 'center',
                        gap: 'var(--space-md)'
                      }}>
                        <div style={{ 
                          width: 40, height: 40, 
                          borderRadius: '50%', 
                          background: 'var(--primary)',
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          fontWeight: 600
                        }}>
                          {(member.full_name || member.email || 'U').slice(0, 2).toUpperCase()}
                        </div>
                        <div style={{ flex: 1 }}>
                          <div style={{ fontWeight: 500 }}>{member.full_name || 'Anonymous User'}</div>
                          <div style={{ fontSize: '0.8rem', color: 'var(--text-dim)' }}>{member.email}</div>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-md)' }}>
                          <select 
                            value={member.role}
                            onChange={(e) => updateMemberRole(member.id, e.target.value)}
                            disabled={selectedTeam.role !== 'admin' || member.user_id === user?.id}
                            className="glass-input"
                            style={{ padding: '4px 8px', fontSize: '0.8rem' }}
                          >
                            <option value="admin">Admin</option>
                            <option value="editor">Editor</option>
                            <option value="viewer">Viewer</option>
                          </select>
                          {selectedTeam.role === 'admin' && member.user_id !== user?.id && (
                            <button 
                              onClick={() => removeMember(member.id)}
                              className="btn btn-glass btn-sm" 
                              style={{ padding: '6px', color: 'var(--danger)' }}
                            >
                              <Trash2 size={16} />
                            </button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </section>

                {/* Invite Section */}
                {selectedTeam.role === 'admin' && (
                  <section className="glass-panel" style={{ padding: 'var(--space-lg)', height: 'fit-content' }}>
                    <h4 style={{ marginTop: 0 }}>Invite Member</h4>
                    <p style={{ fontSize: '0.85rem', color: 'var(--text-dim)' }}>Invite someone to collaborate on team projects.</p>
                    
                    <div style={{ marginTop: 'var(--space-md)' }}>
                      <label style={{ display: 'block', fontSize: '0.8rem', marginBottom: '4px' }}>Email Address</label>
                      <input 
                        type="email"
                        className="glass-input"
                        placeholder="colleague@example.com"
                        value={inviteEmail}
                        onChange={(e) => setInviteEmail(e.target.value)}
                        style={{ width: '100%', marginBottom: 'var(--space-md)' }}
                      />
                      
                      <label style={{ display: 'block', fontSize: '0.8rem', marginBottom: '4px' }}>Role</label>
                      <select 
                        className="glass-input"
                        value={inviteRole}
                        onChange={(e) => setInviteRole(e.target.value as any)}
                        style={{ width: '100%', marginBottom: 'var(--space-lg)' }}
                      >
                        <option value="admin">Admin (Manage members & projects)</option>
                        <option value="editor">Editor (Create & edit projects)</option>
                        <option value="viewer">Viewer (Read only)</option>
                      </select>

                      <button 
                        className="btn btn-primary" 
                        style={{ width: '100%' }}
                        onClick={inviteMember}
                        disabled={actionPending || !inviteEmail.trim()}
                      >
                        {actionPending ? 'Inviting...' : 'Send Invitation'}
                      </button>
                    </div>
                  </section>
                )}
              </div>
            </div>
          ) : (
            <div className="glass-panel" style={{ height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: 'var(--text-dim)', padding: 'var(--space-xl)' }}>
              <Users size={64} style={{ marginBottom: 'var(--space-lg)', opacity: 0.2 }} />
              <h3>Select a team to manage</h3>
              <p>Choose a team from the sidebar to view members and permissions.</p>
            </div>
          )}
        </div>
      </div>

      {/* Create Team Modal */}
      {showCreateModal && (
        <div className="modal-overlay" onClick={() => setShowCreateModal(false)}>
          <div className="glass-panel modal-content" onClick={e => e.stopPropagation()} style={{ maxWidth: '400px' }}>
            <h3>Create New Team</h3>
            <p style={{ color: 'var(--text-dim)', fontSize: '0.9rem' }}>Teams allow you to share projects and collaborate with other users.</p>
            
            <div style={{ marginTop: 'var(--space-lg)' }}>
              <label style={{ display: 'block', fontSize: '0.85rem', marginBottom: '8px' }}>Team Name</label>
              <input 
                autoFocus
                className="glass-input"
                placeholder="Marketing Engine"
                value={newTeamName}
                onChange={(e) => setNewTeamName(e.target.value)}
                style={{ width: '100%', marginBottom: 'var(--space-xl)' }}
              />
              
              <div className="button-row">
                <button className="btn btn-glass" onClick={() => setShowCreateModal(false)}>Cancel</button>
                <button 
                  className="btn btn-primary" 
                  onClick={createTeam}
                  disabled={actionPending || !newTeamName.trim()}
                >
                  {actionPending ? 'Creating...' : 'Create Team'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default TeamsView;
