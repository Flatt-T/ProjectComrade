// Project Comrade browser integration for Red Alert. Game rules remain in Vanilla Conquer.
//
// A near-copy of the Tiberian Dawn bridge next to it, with Red Alert's differences:
// its map is 128 cells wide (so cells are reported in the engine's own indexing rather
// than Tiberian Dawn's 64-wide grid), it has ships and aircraft to report as well as
// units, buildings and infantry, and Can_Build takes an RTTI type with the id.
#include "function.h"
#include "video.h"
#ifdef __EMSCRIPTEN__
#include <emscripten.h>
#include <cstdio>
#include <cstring>

// Entity ids keep each heap in its own band, so one number names any object.
enum
{
    ID_BUILDING = 10000,
    ID_INFANTRY = 20000,
    ID_VESSEL = 30000,
    ID_AIRCRAFT = 40000,
};

static TechnoClass* find_entity(int id)
{
    if (id >= ID_AIRCRAFT) {
        for (int i = 0; i < Aircraft.Count(); ++i)
            if (Aircraft.ID(Aircraft.Ptr(i)) == id - ID_AIRCRAFT)
                return Aircraft.Ptr(i);
    } else if (id >= ID_VESSEL) {
        for (int i = 0; i < Vessels.Count(); ++i)
            if (Vessels.ID(Vessels.Ptr(i)) == id - ID_VESSEL)
                return Vessels.Ptr(i);
    } else if (id >= ID_INFANTRY) {
        for (int i = 0; i < Infantry.Count(); ++i)
            if (Infantry.ID(Infantry.Ptr(i)) == id - ID_INFANTRY)
                return Infantry.Ptr(i);
    } else if (id >= ID_BUILDING) {
        for (int i = 0; i < Buildings.Count(); ++i)
            if (Buildings.ID(Buildings.Ptr(i)) == id - ID_BUILDING)
                return Buildings.Ptr(i);
    } else {
        for (int i = 0; i < Units.Count(); ++i)
            if (Units.ID(Units.Ptr(i)) == id)
                return Units.Ptr(i);
    }
    return nullptr;
}

/** One heap's worth of objects, as the snapshot reports them. */
static int heap_count(int group)
{
    switch (group) {
    case 0:
        return Units.Count();
    case 1:
        return Buildings.Count();
    case 2:
        return Infantry.Count();
    case 3:
        return Vessels.Count();
    default:
        return Aircraft.Count();
    }
}

static TechnoClass* heap_object(int group, int index)
{
    switch (group) {
    case 0:
        return (TechnoClass*)Units.Ptr(index);
    case 1:
        return (TechnoClass*)Buildings.Ptr(index);
    case 2:
        return (TechnoClass*)Infantry.Ptr(index);
    case 3:
        return (TechnoClass*)Vessels.Ptr(index);
    default:
        return (TechnoClass*)Aircraft.Ptr(index);
    }
}

static int heap_id(int group, int index)
{
    switch (group) {
    case 0:
        return Units.ID(Units.Ptr(index));
    case 1:
        return ID_BUILDING + Buildings.ID(Buildings.Ptr(index));
    case 2:
        return ID_INFANTRY + Infantry.ID(Infantry.Ptr(index));
    case 3:
        return ID_VESSEL + Vessels.ID(Vessels.Ptr(index));
    default:
        return ID_AIRCRAFT + Aircraft.ID(Aircraft.Ptr(index));
    }
}

extern "C" EMSCRIPTEN_KEEPALIVE const char* comrade_snapshot()
{
    static char result[16384];
    if (!PlayerPtr)
        return "{\"frame\":0}";
    std::snprintf(result,
                  sizeof(result),
                  "{\"frame\":%d,\"credits\":%d,\"harvested\":%u,\"spent\":%u,\"units\":%u,\"buildings\":%u,\"power\":%d,"
                  "\"drain\":%d,\"lost\":%u,\"won\":%s,\"defeated\":%s,\"entities\":[",
                  Frame,
                  PlayerPtr->Available_Money(),
                  PlayerPtr->HarvestedCredits,
                  PlayerPtr->CreditsSpent,
                  PlayerPtr->CurUnits,
                  PlayerPtr->CurBuildings,
                  PlayerPtr->Power,
                  PlayerPtr->Drain,
                  PlayerPtr->UnitsLost,
                  PlayerWins ? "true" : "false",
                  PlayerLoses ? "true" : "false");
    bool first = true;
    for (int group = 0; group < 5; ++group) {
        int count = heap_count(group);
        for (int i = 0; i < count && std::strlen(result) < 15000; ++i) {
            TechnoClass* object = heap_object(group, i);
            if (object->IsInLimbo)
                continue;
            char entity[256];
            std::snprintf(entity,
                          sizeof(entity),
                          "%s{\"id\":%d,\"owner\":%d,\"cell\":%d,\"hp\":%d,\"name\":\"%s\"}",
                          first ? "" : ",",
                          heap_id(group, i),
                          (int)object->Owner(),
                          (int)Coord_Cell(object->Coord),
                          object->Strength,
                          object->Techno_Type_Class()->IniName);
            std::strcat(result, entity);
            first = false;
        }
    }
    int audio = EM_ASM_INT({
        return typeof AL !== 'undefined' && AL.currentCtx && AL.currentCtx.audioCtx.state === 'running' ? 1 : 0;
    });
    int mx, my;
    Get_Video_Mouse(mx, my);
    char tail[200];
    std::snprintf(tail,
                  sizeof(tail),
                  "],\"audioRunning\":%s,\"mouseX\":%d,\"mouseY\":%d,\"selected\":%d,\"camera\":%d}",
                  audio ? "true" : "false",
                  mx,
                  my,
                  CurrentObject.Count(),
                  (int)Coord_Cell(Map.TacticalCoord));
    std::strcat(result, tail);
    return result;
}

extern "C" EMSCRIPTEN_KEEPALIVE int comrade_order(int action, int entity, int target, const char* item)
{
    if (!PlayerPtr || Frame < 1 || PlayerWins || PlayerLoses)
        return 0;
    HousesType house = PlayerPtr->Class->House;
    if (action == 3) {
        StructType type = BuildingTypeClass::From_Name(item);
        if (type < 0 || type >= STRUCT_COUNT || !PlayerPtr->Can_Build(RTTI_BUILDINGTYPE, (int)type, house))
            return 0;
        return PlayerPtr->Begin_Production(RTTI_BUILDINGTYPE, (int)type) == PROD_OK;
    }
    if (action == 4) {
        InfantryType type = InfantryTypeClass::From_Name(item);
        if (type < 0 || type >= INFANTRY_COUNT || !PlayerPtr->Can_Build(RTTI_INFANTRYTYPE, (int)type, house))
            return 0;
        return PlayerPtr->Begin_Production(RTTI_INFANTRYTYPE, (int)type) == PROD_OK;
    }
    if (action == 5) {
        if (target < 0 || target >= MAP_CELL_TOTAL)
            return 0;
        if (PlayerPtr->BuildingFactory == -1)
            return 0;
        FactoryClass* factory = Factories.Raw_Ptr(PlayerPtr->BuildingFactory);
        if (!factory || !factory->Has_Completed())
            return 0;
        TechnoClass* pending = factory->Get_Object();
        if (!pending || std::strcmp(pending->Techno_Type_Class()->IniName, item))
            return 0;
        return PlayerPtr->Place_Object(RTTI_BUILDINGTYPE, (CELL)target);
    }
    TechnoClass* actor = find_entity(entity);
    if (!actor || actor->IsInLimbo || actor->Owner() != house || actor->What_Am_I() == RTTI_BUILDING)
        return 0;
    if (action == 1) {
        TechnoClass* enemy = find_entity(target);
        if (!enemy || enemy->Owner() == actor->Owner())
            return 0;
        actor->Player_Assign_Mission(MISSION_ATTACK, enemy->As_Target());
    } else {
        if (target < 0 || target >= MAP_CELL_TOTAL)
            return 0;
        actor->Player_Assign_Mission(action == 2 ? MISSION_HARVEST : MISSION_MOVE,
                                     TARGET_NONE,
                                     ::As_Target((CELL)target));
    }
    return 1;
}

extern "C" EMSCRIPTEN_KEEPALIVE void comrade_audio()
{
    EM_ASM({
        if (typeof AL !== 'undefined' && AL.currentCtx)
            AL.currentCtx.audioCtx.resume();
    });
}
#endif
