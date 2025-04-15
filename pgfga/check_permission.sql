-- This function takes in an authz_model so we don't have to query the
-- table on every recursive call.
create or replace function check_permission(
    p_authz_model authz_model[],
    p_user_type text,
    p_user_id text,
    p_relation text,
    p_object_type text,
    p_object_id text
)
returns boolean as $$
declare
    v_implied_by text;
    v_parent_relation text;
    v_parent_object_id text;
    v_has_permission boolean := false;
begin
    raise debug 'Checking: user % has relation % on object %', p_user_id, p_relation, p_object_id;

    -- 0. Check for 'from <relation>' parent context first.
    -- This is likely to be the most common case as most of our relations are
    -- inherited, so check it first.
    select am.parent_relation, am.implied_by
    into v_parent_relation, v_implied_by
    from unnest(p_authz_model) as am
    where entity_type = p_object_type
      and relation = p_relation;

    raise debug 'Parent Relation: % for relation % on %', v_parent_relation, p_relation, p_object_type;

    if v_parent_relation is not null then
        -- Determine the parent object id by querying authz_relationship for the parent relation
        select object_id
        into v_parent_object_id
        from authz_relationship
        where user_id = p_object_id
          and relation = v_parent_relation -- Use parent_relation from p_authz_model
          and user_type = p_object_type; -- User type is the current object type (e.g., repository)

        raise debug 'Parent Object ID: % for parent relation % on %', v_parent_object_id, v_parent_relation, p_object_type;

        if v_parent_object_id is not null then
            -- Recursively check permission in the parent context (same relation, but on parent object)
            select check_permission(p_authz_model, p_user_type, p_user_id, v_implied_by, v_parent_relation, v_parent_object_id) into v_has_permission;
            raise debug 'Permission in Parent Context (% % % % %): %', p_user_id, p_user_type, v_implied_by, v_parent_object_id, v_parent_relation, v_has_permission;
            if v_has_permission then
                return true; -- Permission inherited from parent context
            end if;
        end if;

        -- If parent context check succeeded or failed, return the result
        return v_has_permission;
    end if;


    -- 1. Check for direct relationship in authz_relationship view for the requested relation (if no parent context)
    select true into v_has_permission
    from authz_relationship
    where user_id = p_user_id
      and user_type = p_user_type -- Now using p_user_type
      and relation = p_relation  -- Check for the *requested* relation directly
      and object_id = p_object_id
      and object_type = p_object_type;

    raise debug 'Direct Relationship Check: % for relation % on %', v_has_permission, p_relation, p_object_type;


    if v_has_permission then
        return true; -- Direct permission found
    end if;

    -- 2. Check for implied permissions (Role Hierarchy) - only if no parent context and no direct relation
    select am.implied_by
    into v_implied_by
    from unnest(p_authz_model) as am
    where entity_type = p_object_type
      and relation = p_relation;

    raise debug 'Implied By: % for relation % on %', v_implied_by, p_relation, p_object_type;


    if v_implied_by is not null then
        -- Recursively check for permission with the role that implies this one
        select check_permission(p_authz_model, p_user_type, p_user_id, v_implied_by, p_object_type, p_object_id) into v_has_permission;
        raise debug 'permission with implied by role (% % % % %): %', p_user_id, p_user_type, v_implied_by, p_object_id, p_object_type, v_has_permission;
        if v_has_permission then
            return true; -- Implied permission found
        end if;
    end if;

    raise debug 'Final Permission Result: % for relation % on %', v_has_permission, p_relation, p_object_type;
    return false; -- No permission found
end;
$$ language plpgsql;

-- Function overload to take a schema version
create or replace function check_permission(
    p_schema_version bigint,
    p_user_type text,
    p_user_id text,
    p_relation text,
    p_object_type text,
    p_object_id text
)
returns boolean as $$
declare
    v_authz_model authz_model[];
begin
    -- Get the authz_model for the requested version
    v_authz_model := array(
        select am
        from authz_model as am
        where schema_version = p_schema_version
    );

    raise debug 'Authz Model: %', v_authz_model;

    -- Error if the array is empty
    if array_length(v_authz_model, 1) is null then
        raise exception 'Schema version % not found', p_schema_version;
        return false;
    end if;

    return check_permission(v_authz_model, p_user_type, p_user_id, p_relation, p_object_type, p_object_id);
end;
$$ language plpgsql;

-- Function overload for local development that uses tha latest schema version
create or replace function check_permission(
    p_user_type text,
    p_user_id text,
    p_relation text,
    p_object_type text,
    p_object_id text
)
returns boolean as $$
declare
    v_authz_model authz_model[];
begin
    -- Get the authz_model for the requested version
    v_authz_model := array(
        select am
        from authz_model as am
        where schema_version = (
            select max(schema_version)
            from authz_model
        )
    );

    raise debug 'Authz Model: %', v_authz_model;

    -- Error if the array is empty
    if array_length(v_authz_model, 1) is null then
        raise exception 'Model % not found', p_model_version;
        return false;
    end if;

    return check_permission(v_authz_model, p_user_type, p_user_id, p_relation, p_object_type, p_object_id);
end;
$$ language plpgsql;
