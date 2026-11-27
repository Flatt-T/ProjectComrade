"""Executable acceptance oracle for the quoted Fusion repair transaction.

Run python bridge_oracle.py. It exercises integer accounting and deadlines.
Navigation and protection use the engine integration fixtures in first-battle.md.
"""
from dataclasses import dataclass, field, asdict
import json
from pathlib import Path

MAX_HP = 2400

@dataclass
class Bridge:
    hp: list[int]
    credits: int
    engineers: list[str]
    revision: int = 0
    job: dict | None = None
    receipts: dict = field(default_factory=dict)
    events: list = field(default_factory=list)

    def admit(self, key, actor, rev, tick, at_visible_permitted_hut=True):
        if key in self.receipts:
            return self.receipts[key]
        broken=[i for i,h in enumerate(self.hp) if h<MAX_HP]
        missing=sum(MAX_HP-self.hp[i] for i in broken if self.hp[i]>0)
        lost=sum(self.hp[i]==0 for i in broken)
        cost=600*lost+(missing+3)//4
        if rev!=self.revision: answer='stale_revision'
        elif self.job: answer='job_active'
        elif actor not in self.engineers or not at_visible_permitted_hut: answer='invalid_actor_or_access'
        elif not broken: answer='intact'
        elif self.credits<cost: answer='insufficient_credits'
        else:
            self.credits-=cost
            self.engineers.remove(actor)
            self.job={'cost':cost,'targets':broken,'finish':tick+(450 if lost else 150),'blocked_at':None}
            self.events.append(['admit',key,tick,cost]);answer='accepted'
        self.receipts[key]=answer
        return answer

    def damage(self, span, amount, tick, scaffold=False):
        if amount<=0:return
        if self.job:
            self.events.append(['abort_damage',tick]);self.job=None
        if not scaffold:
            was_open=self.hp[span]>0;self.hp[span]=max(0,self.hp[span]-amount)
            if was_open and self.hp[span]==0:
                self.revision+=1;self.events.append(['deck_closed',span,tick,self.revision])

    def advance(self,tick,incompatible=False):
        j=self.job
        if j is None or tick<j['finish']:return
        if incompatible:
            if j['blocked_at'] is None:
                j['blocked_at']=tick;self.events.append(['blocked',tick])
            if tick-j['blocked_at']>=900:
                self.credits+=j['cost'];self.events.append(['refund',tick,j['cost']]);self.job=None
            return
        for i in j['targets']:self.hp[i]=MAX_HP
        self.revision+=1;self.job=None;self.events.append(['restore',tick,self.revision])

def verify():
    results=[]
    def passed(name,b):results.append({'fixture':name,'final':asdict(b)})
    b=Bridge([2400,0,2397],1000,['E6:a','E6:b']); assert b.admit('request:a','E6:a',0,20)=='accepted'
    assert b.credits==399 and b.hp[1]==0 and b.job['finish']==470
    assert b.admit('request:a','E6:a',0,21)=='accepted' and b.credits==399
    assert b.admit('request:b','E6:b',0,21)=='job_active' and b.engineers==['E6:b']
    b.advance(469); assert b.hp[1]==0
    resume=Bridge(**json.loads(json.dumps(asdict(b))))
    b.advance(470); resume.advance(470);resume.advance(471)
    assert asdict(resume)==asdict(b) and b.hp==[2400]*3 and b.revision==1
    passed('quoted mixed damage, racing engineers, duplicate command, save and single atomic reopen',b)
    b=Bridge([0],599,['engineer'])
    assert b.admit('a','engineer',0,0)=='insufficient_credits' and b.credits==599 and b.engineers
    passed('credit rejection preserves actor and budget',b)
    b=Bridge([0],600,['e'])
    assert b.admit('stale','e',1,0)=='stale_revision'
    assert b.admit('no-access','e',0,0,False)=='invalid_actor_or_access' and b.credits==600
    b.admit('admit','e',0,1);b.damage(0,1,6,True);b.advance(451)
    assert b.hp==[0] and b.credits==0 and not b.engineers and b.revision==0
    passed('scaffold hit cancels once with closed route and no refund',b)
    b=Bridge([2399,2398],10,['e']);b.admit('partial','e',0,0)
    assert b.credits==9 and b.job['finish']==150
    b.advance(150,True);b.advance(1049,True)
    assert b.job and b.credits==9
    b.advance(1050,True);b.advance(1051,True)
    assert b.credits==10 and not b.engineers and b.hp==[2399,2398]
    passed('ceil on aggregate deficit, completion obstruction, exactly one credit refund',b)
    b=Bridge([2400,2400,2400],2000,['e']);b.damage(1,2400,2);b.damage(1,100,3)
    assert b.hp==[2400,0,2400] and b.revision==1
    b.admit('repair','e',1,3);b.advance(453,True);b.advance(454)
    assert b.revision==2 and b.hp==[2400]*3 and b.credits==1400
    passed('independent span, one close, clear obstruction and reopen once',b)
    return results

if __name__=='__main__':
    output=verify();print(json.dumps({'profile':'fusion-bridge-v1','type':'research oracle; no claim of engine/device execution','cases_passed':len(output),'results':output},indent=1))
