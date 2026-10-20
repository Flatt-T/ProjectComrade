// Project Comrade browser integration. Game rules remain in Vanilla Conquer.
#include "function.h"
#include "video.h"
#ifdef __EMSCRIPTEN__
#include <emscripten.h>
#include <cstdio>
#include <cstring>
static int old_cell(CELL cell) { return (cell / MAP_CELL_W) * 64 + (cell % MAP_CELL_W); }
static TechnoClass* find_entity(int id)
{
    if (id >= 20000) { for (int i=0; i<Infantry.Count(); ++i) if (Infantry.ID(Infantry.Ptr(i)) == id-20000) return Infantry.Ptr(i); }
    else if (id >= 10000) { for (int i=0; i<Buildings.Count(); ++i) if (Buildings.ID(Buildings.Ptr(i)) == id-10000) return Buildings.Ptr(i); }
    else { for (int i=0; i<Units.Count(); ++i) if (Units.ID(Units.Ptr(i)) == id) return Units.Ptr(i); }
    return nullptr;
}
extern "C" EMSCRIPTEN_KEEPALIVE const char* comrade_snapshot()
{
    static char result[16384];
    if (!PlayerPtr) return "{\"frame\":0}";
    std::snprintf(result, sizeof(result),
        "{\"frame\":%d,\"credits\":%d,\"harvested\":%u,\"spent\":%u,\"units\":%u,\"buildings\":%u,\"power\":%d,\"drain\":%d,\"lost\":%u,\"won\":%s,\"defeated\":%s,\"entities\":[",
        Frame, PlayerPtr->Available_Money(), PlayerPtr->HarvestedCredits, PlayerPtr->CreditsSpent,
        PlayerPtr->CurUnits, PlayerPtr->CurBuildings, PlayerPtr->Power, PlayerPtr->Drain,
        PlayerPtr->UnitsLost, PlayerWins ? "true" : "false", PlayerLoses ? "true" : "false");
    bool first = true;
    for (int group=0; group<3; ++group) {
        int count = group==0 ? Units.Count() : (group==1 ? Buildings.Count() : Infantry.Count());
        for (int i=0; i<count && std::strlen(result)<15000; ++i) {
            TechnoClass* object = group==0 ? (TechnoClass*)Units.Ptr(i) : (group==1 ? (TechnoClass*)Buildings.Ptr(i) : (TechnoClass*)Infantry.Ptr(i));
            if (object->IsInLimbo) continue;
            int id = group==0 ? Units.ID(Units.Ptr(i)) : (group==1 ? 10000+Buildings.ID(Buildings.Ptr(i)) : 20000+Infantry.ID(Infantry.Ptr(i)));
            char entity[256];
            const char* name = group==0 ? Units.Ptr(i)->Class->IniName : (group==1 ? Buildings.Ptr(i)->Class->IniName : Infantry.Ptr(i)->Class->IniName);
            std::snprintf(entity, sizeof(entity), "%s{\"id\":%d,\"owner\":%d,\"cell\":%d,\"hp\":%d,\"name\":\"%s\"}",first?"":",", id, (int)object->Owner(), old_cell(Coord_Cell(object->Coord)), object->Strength, name);
            std::strcat(result, entity); first=false;
        }
    }
    int audio = EM_ASM_INT({ return typeof AL !== 'undefined' && AL.currentCtx && AL.currentCtx.audioCtx.state === 'running' ? 1 : 0; });
    int mx, my; Get_Video_Mouse(mx, my);
    char tail[200];
    std::snprintf(tail, sizeof(tail), "],\"audioRunning\":%s,\"mouseX\":%d,\"mouseY\":%d,\"selected\":%d,\"camera\":%d}", audio ? "true" : "false", mx, my, CurrentObject.Count(), old_cell(Coord_Cell(Map.TacticalCoord)));
    std::strcat(result, tail);
    return result;
}
extern "C" EMSCRIPTEN_KEEPALIVE int comrade_order(int action, int entity, int target, const char* item)
{
    if (!PlayerPtr || Frame<1 || PlayerWins || PlayerLoses) return 0;
    if (action==3) {
        StructType type = BuildingTypeClass::From_Name(item);
        if (type < 0 || type >= STRUCT_COUNT || !PlayerPtr->Can_Build(type, PlayerPtr->Class->House)) return 0;
        return PlayerPtr->Begin_Production(RTTI_BUILDINGTYPE, type)==PROD_OK;
    }
    if (action==4) {
        InfantryType type = InfantryTypeClass::From_Name(item);
        if (type < 0 || type >= INFANTRY_COUNT || !PlayerPtr->Can_Build(type, PlayerPtr->Class->House)) return 0;
        return PlayerPtr->Begin_Production(RTTI_INFANTRYTYPE, type)==PROD_OK;
    }
    if (action==5) {
        if (target<0 || target>=4096) return 0;
        if (PlayerPtr->BuildingFactory == -1) return 0;
        FactoryClass* factory = Factories.Raw_Ptr(PlayerPtr->BuildingFactory);
        if (!factory || !factory->Has_Completed()) return 0;
        TechnoClass* pending = factory->Get_Object();
        if (!pending || std::strcmp(pending->Techno_Type_Class()->IniName, item)) return 0;
        return PlayerPtr->Place_Object(RTTI_BUILDINGTYPE, Confine_Old_Cell(target));
    }
    TechnoClass* actor = find_entity(entity);
    if (!actor || actor->IsInLimbo || actor->Owner()!=PlayerPtr->Class->House || actor->What_Am_I()==RTTI_BUILDING) return 0;
    if (action==1) {
        TechnoClass* enemy = find_entity(target);
        if (!enemy || enemy->Owner()==actor->Owner()) return 0;
        actor->Player_Assign_Mission(MISSION_ATTACK, enemy->As_Target());
    } else {
        if (target<0 || target>=4096) return 0;
        actor->Player_Assign_Mission(action==2 ? MISSION_HARVEST : MISSION_MOVE, TARGET_NONE, ::As_Target(Confine_Old_Cell(target)));
    }
    return 1;
}
extern "C" EMSCRIPTEN_KEEPALIVE void comrade_audio()
{
    EM_ASM({ if (typeof AL !== 'undefined' && AL.currentCtx) AL.currentCtx.audioCtx.resume(); });
}
#endif
