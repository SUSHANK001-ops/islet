//! Character pack manifest types. Mirrors shared/schemas/character.schema.json
//! and CHARACTERS.md. These deserialize an UNTRUSTED manifest.json; validation
//! lives in `validate.rs` (Rust is the source of truth, never trust the pack).

use std::collections::BTreeMap;

use serde::{Deserialize, Serialize};

pub const MANIFEST_VERSION: u32 = 1;

/// The five states every pack MUST define (CHARACTERS.md).
pub const REQUIRED_STATES: [&str; 5] = ["idle", "working", "celebrating", "sleeping", "sad"];

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct SheetSpec {
    pub file: String,
    pub frame_width: u32,
    pub frame_height: u32,
    pub columns: u32,
    #[serde(default = "default_scale")]
    pub scale: u32,
    #[serde(default)]
    pub pixel_art: bool,
}

fn default_scale() -> u32 {
    1
}

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct StateSpec {
    pub frames: Vec<u32>,
    pub fps: u32,
    #[serde(default)]
    pub r#loop: bool,
}

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct StageSpec {
    pub id: String,
    pub min_focus_minutes: u32,
    pub sheet: String,
}

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq, Default)]
#[serde(rename_all = "camelCase")]
pub struct Personality {
    #[serde(default)]
    pub energy: f32,
    #[serde(default)]
    pub chatty: f32,
    #[serde(default)]
    pub lazy: f32,
}

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct OutfitSpec {
    pub id: String,
    pub name: String,
    pub layer: String,
}

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Manifest {
    pub schema_version: u32,
    pub id: String,
    pub name: String,
    pub version: String,
    pub author: String,
    pub license: String,
    pub sheet: SheetSpec,
    /// State name -> spec. BTreeMap for stable ordering in tests/output.
    pub states: BTreeMap<String, StateSpec>,
    #[serde(default)]
    pub moods: BTreeMap<String, String>,
    #[serde(default)]
    pub stages: Vec<StageSpec>,
    #[serde(default)]
    pub personality: Personality,
    #[serde(default)]
    pub outfits: Vec<OutfitSpec>,
}
