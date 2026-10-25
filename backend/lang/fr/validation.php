<?php

/**
 * Messages de validation en français.
 *
 * Laravel 11 ne publie aucun fichier de langue par défaut : sans ce fichier
 * (et sans locale `fr`), toutes les erreurs de validation de l'API sortaient
 * en anglais. On force la locale `fr` dans AppServiceProvider::boot().
 */
return [
    'accepted' => 'Le champ :attribute doit être accepté.',
    'active_url' => "Le champ :attribute n'est pas une URL valide.",
    'after' => 'Le champ :attribute doit être une date postérieure au :date.',
    'after_or_equal' => 'Le champ :attribute doit être une date postérieure ou égale au :date.',
    'alpha' => 'Le champ :attribute ne peut contenir que des lettres.',
    'alpha_dash' => 'Le champ :attribute ne peut contenir que des lettres, des chiffres, des tirets et des tirets bas.',
    'alpha_num' => 'Le champ :attribute ne peut contenir que des lettres et des chiffres.',
    'array' => 'Le champ :attribute doit être un tableau.',
    'before' => 'Le champ :attribute doit être une date antérieure au :date.',
    'before_or_equal' => 'Le champ :attribute doit être une date antérieure ou égale au :date.',
    'between' => [
        'array' => 'Le champ :attribute doit contenir entre :min et :max éléments.',
        'file' => 'Le champ :attribute doit avoir une taille comprise entre :min et :max kilo-octets.',
        'numeric' => 'La valeur de :attribute doit être comprise entre :min et :max.',
        'string' => 'Le champ :attribute doit contenir entre :min et :max caractères.',
    ],
    'boolean' => 'Le champ :attribute doit être vrai ou faux.',
    'confirmed' => 'Le champ de confirmation :attribute ne correspond pas.',
    'date' => "Le champ :attribute n'est pas une date valide.",
    'date_equals' => 'Le champ :attribute doit être une date égale au :date.',
    'date_format' => 'Le champ :attribute ne correspond pas au format :format.',
    'different' => 'Les champs :attribute et :other doivent être différents.',
    'digits' => 'Le champ :attribute doit contenir :digits chiffres.',
    'digits_between' => 'Le champ :attribute doit contenir entre :min et :max chiffres.',
    'email' => 'Le champ :attribute doit être une adresse e-mail valide.',
    'ends_with' => 'Le champ :attribute doit se terminer par une des valeurs suivantes : :values.',
    'exists' => 'La valeur sélectionnée pour :attribute est invalide.',
    'file' => 'Le champ :attribute doit être un fichier.',
    'filled' => 'Le champ :attribute doit avoir une valeur.',
    'gt' => [
        'array' => 'Le champ :attribute doit contenir plus de :value éléments.',
        'file' => 'La taille du champ :attribute doit être supérieure à :value kilo-octets.',
        'numeric' => 'La valeur de :attribute doit être supérieure à :value.',
        'string' => 'Le champ :attribute doit contenir plus de :value caractères.',
    ],
    'gte' => [
        'array' => 'Le champ :attribute doit contenir au moins :value éléments.',
        'file' => 'La taille du champ :attribute doit être supérieure ou égale à :value kilo-octets.',
        'numeric' => 'La valeur de :attribute doit être supérieure ou égale à :value.',
        'string' => 'Le champ :attribute doit contenir au moins :value caractères.',
    ],
    'image' => 'Le champ :attribute doit être une image.',
    'in' => 'La valeur sélectionnée pour :attribute est invalide.',
    'integer' => 'Le champ :attribute doit être un entier.',
    'ip' => 'Le champ :attribute doit être une adresse IP valide.',
    'ipv4' => 'Le champ :attribute doit être une adresse IPv4 valide.',
    'ipv6' => 'Le champ :attribute doit être une adresse IPv6 valide.',
    'json' => 'Le champ :attribute doit être un document JSON valide.',
    'lt' => [
        'array' => 'Le champ :attribute doit contenir moins de :value éléments.',
        'file' => 'La taille du champ :attribute doit être inférieure à :value kilo-octets.',
        'numeric' => 'La valeur de :attribute doit être inférieure à :value.',
        'string' => 'Le champ :attribute doit contenir moins de :value caractères.',
    ],
    'lte' => [
        'array' => 'Le champ :attribute ne doit pas contenir plus de :value éléments.',
        'file' => 'La taille du champ :attribute doit être inférieure ou égale à :value kilo-octets.',
        'numeric' => 'La valeur de :attribute doit être inférieure ou égale à :value.',
        'string' => 'Le champ :attribute doit contenir au plus :value caractères.',
    ],
    'max' => [
        'array' => 'Le champ :attribute ne peut pas contenir plus de :max éléments.',
        'file' => 'La taille du champ :attribute ne peut pas dépasser :max kilo-octets.',
        'numeric' => 'La valeur de :attribute ne peut pas être supérieure à :max.',
        'string' => 'Le champ :attribute ne peut pas contenir plus de :max caractères.',
    ],
    'mimes' => 'Le champ :attribute doit être un fichier de type : :values.',
    'mimetypes' => 'Le champ :attribute doit être un fichier de type : :values.',
    'min' => [
        'array' => 'Le champ :attribute doit contenir au moins :min éléments.',
        'file' => 'La taille du champ :attribute doit être supérieure à :min kilo-octets.',
        'numeric' => 'La valeur de :attribute doit être supérieure ou égale à :min.',
        'string' => 'Le champ :attribute doit contenir au moins :min caractères.',
    ],
    'not_in' => 'La valeur sélectionnée pour :attribute est invalide.',
    'numeric' => 'Le champ :attribute doit être un nombre.',
    'present' => 'Le champ :attribute doit être présent.',
    'regex' => 'Le format du champ :attribute est invalide.',
    'required' => 'Le champ :attribute est obligatoire.',
    'required_if' => 'Le champ :attribute est obligatoire quand :other vaut :value.',
    'required_unless' => "Le champ :attribute est obligatoire sauf si :other est dans :values.",
    'required_with' => 'Le champ :attribute est obligatoire quand :values est présent.',
    'required_without' => "Le champ :attribute est obligatoire quand :values n'est pas présent.",
    'same' => 'Les champs :attribute et :other doivent être identiques.',
    'size' => [
        'array' => 'Le champ :attribute doit contenir :size éléments.',
        'file' => 'La taille du champ :attribute doit être de :size kilo-octets.',
        'numeric' => 'La valeur de :attribute doit être :size.',
        'string' => 'Le champ :attribute doit contenir :size caractères.',
    ],
    'starts_with' => 'Le champ :attribute doit commencer par une des valeurs suivantes : :values.',
    'string' => 'Le champ :attribute doit être une chaîne de caractères.',
    'unique' => 'La valeur du champ :attribute est déjà utilisée.',
    'uploaded' => "Le téléversement du champ :attribute a échoué.",
    'uuid' => 'Le champ :attribute doit être un identifiant valide.',

    /*
    | Libellés lisibles des champs (remplacent les noms techniques dans les
    | messages ci-dessus, ex. « agence principale » au lieu de « primary
    | branch id »).
    */
    'attributes' => [
        'email' => 'e-mail',
        'password' => 'mot de passe',
        'first_name' => 'prénom',
        'last_name' => 'nom',
        'name' => 'nom',
        'phone' => 'téléphone',
        'role' => 'rôle',
        'role_ids' => 'rôles',
        'branch_ids' => 'agences',
        'primary_branch_id' => 'agence principale',
        'company_id' => 'société',
        'locale' => 'langue',
        'status' => 'statut',
        'code' => 'code',
        'description' => 'description',
        'is_active' => 'statut actif',
    ],
];
