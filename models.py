from django.db import models


class AuthGroup(models.Model):
    name = models.CharField(unique=True, max_length=150)

    class Meta:
        managed = False
        db_table = 'auth_group'


class AuthGroupPermissions(models.Model):
    id = models.BigAutoField(primary_key=True)
    group = models.ForeignKey(AuthGroup, models.DO_NOTHING)
    permission = models.ForeignKey('AuthPermission', models.DO_NOTHING)

    class Meta:
        managed = False
        db_table = 'auth_group_permissions'
        unique_together = (('group', 'permission'),)


class AuthPermission(models.Model):
    name = models.CharField(max_length=255)
    content_type = models.ForeignKey('DjangoContentType', models.DO_NOTHING)
    codename = models.CharField(max_length=100)

    class Meta:
        managed = False
        db_table = 'auth_permission'
        unique_together = (('content_type', 'codename'),)


class AuthUser(models.Model):
    password = models.CharField(max_length=128)
    last_login = models.DateTimeField(blank=True, null=True)
    is_superuser = models.BooleanField()
    username = models.CharField(unique=True, max_length=150)
    first_name = models.CharField(max_length=150)
    last_name = models.CharField(max_length=150)
    email = models.CharField(max_length=254)
    is_staff = models.BooleanField()
    is_active = models.BooleanField()
    date_joined = models.DateTimeField()
    role = models.TextField(blank=True, null=True)  # This field type is a guess.

    class Meta:
        managed = False
        db_table = 'auth_user'


class AuthUserGroups(models.Model):
    id = models.BigAutoField(primary_key=True)
    user = models.ForeignKey(AuthUser, models.DO_NOTHING)
    group = models.ForeignKey(AuthGroup, models.DO_NOTHING)

    class Meta:
        managed = False
        db_table = 'auth_user_groups'
        unique_together = (('user', 'group'),)


class AuthUserUserPermissions(models.Model):
    id = models.BigAutoField(primary_key=True)
    user = models.ForeignKey(AuthUser, models.DO_NOTHING)
    permission = models.ForeignKey(AuthPermission, models.DO_NOTHING)

    class Meta:
        managed = False
        db_table = 'auth_user_user_permissions'
        unique_together = (('user', 'permission'),)


class ClassifierNode(models.Model):
    parent = models.ForeignKey('self', models.DO_NOTHING, blank=True, null=True)
    name = models.TextField(unique=True)
    unit = models.TextField(blank=True, null=True)
    sort_order = models.IntegerField()

    class Meta:
        managed = False
        db_table = 'classifier_node'


class DjangoAdminLog(models.Model):
    action_time = models.DateTimeField()
    object_id = models.TextField(blank=True, null=True)
    object_repr = models.CharField(max_length=200)
    action_flag = models.SmallIntegerField()
    change_message = models.TextField()
    content_type = models.ForeignKey('DjangoContentType', models.DO_NOTHING, blank=True, null=True)
    user = models.ForeignKey(AuthUser, models.DO_NOTHING)

    class Meta:
        managed = False
        db_table = 'django_admin_log'


class DjangoContentType(models.Model):
    app_label = models.CharField(max_length=100)
    model = models.CharField(max_length=100)

    class Meta:
        managed = False
        db_table = 'django_content_type'
        unique_together = (('app_label', 'model'),)


class DjangoMigrations(models.Model):
    id = models.BigAutoField(primary_key=True)
    app = models.CharField(max_length=255)
    name = models.CharField(max_length=255)
    applied = models.DateTimeField()

    class Meta:
        managed = False
        db_table = 'django_migrations'


class DjangoSession(models.Model):
    session_key = models.CharField(primary_key=True, max_length=40)
    session_data = models.TextField()
    expire_date = models.DateTimeField()

    class Meta:
        managed = False
        db_table = 'django_session'


class EnumDefinition(models.Model):
    classifier_node = models.OneToOneField(ClassifierNode, models.DO_NOTHING)
    description = models.TextField(blank=True, null=True)

    class Meta:
        managed = False
        db_table = 'enum_definition'


class EnumValue(models.Model):
    enum_definition = models.ForeignKey(EnumDefinition, models.DO_NOTHING)
    value_str = models.TextField(blank=True, null=True)
    value_int = models.IntegerField(blank=True, null=True)
    value_real = models.FloatField(blank=True, null=True)
    sort_order = models.IntegerField()

    class Meta:
        managed = False
        db_table = 'enum_value'


class ParameterDefinition(models.Model):
    classifier_node = models.ForeignKey(ClassifierNode, models.DO_NOTHING)
    name = models.CharField(max_length=128)
    unit = models.ForeignKey('Unit', models.DO_NOTHING, blank=True, null=True)
    value_type = models.CharField(max_length=8)
    sort_order = models.IntegerField()

    class Meta:
        managed = False
        db_table = 'parameter_definition'
        unique_together = (('classifier_node', 'name'),)


class ParameterNumericConstraint(models.Model):
    parameter_definition = models.OneToOneField(ParameterDefinition, models.DO_NOTHING, primary_key=True)
    min_value = models.DecimalField(max_digits=20, decimal_places=6)
    max_value = models.DecimalField(max_digits=20, decimal_places=6)

    class Meta:
        managed = False
        db_table = 'parameter_numeric_constraint'


class Product(models.Model):
    classifier_node = models.ForeignKey(ClassifierNode, models.DO_NOTHING)
    sku = models.CharField(unique=True, max_length=100, blank=True, null=True)
    name = models.TextField()
    created_at = models.DateTimeField(blank=True, null=True)
    price = models.IntegerField()
    supplier = models.TextField()
    weight_gram = models.IntegerField()

    class Meta:
        managed = False
        db_table = 'product'


class ProductAttributeValue(models.Model):
    product = models.ForeignKey(Product, models.DO_NOTHING)
    enum_value = models.ForeignKey(EnumValue, models.DO_NOTHING, blank=True, null=True)

    class Meta:
        managed = False
        db_table = 'product_attribute_value'


class ProductParameterValue(models.Model):
    product = models.ForeignKey(Product, models.DO_NOTHING)
    parameter_definition = models.ForeignKey(ParameterDefinition, models.DO_NOTHING)
    value_str = models.TextField(blank=True, null=True)
    value_int = models.IntegerField(blank=True, null=True)
    value_real = models.DecimalField(max_digits=12, decimal_places=4, blank=True, null=True)
    value_enum = models.ForeignKey(EnumValue, models.DO_NOTHING, blank=True, null=True)

    class Meta:
        managed = False
        db_table = 'product_parameter_value'
        unique_together = (('product', 'parameter_definition'),)


class Unit(models.Model):
    dimension = models.ForeignKey('UnitDimension', models.DO_NOTHING)
    name = models.CharField(max_length=64)
    symbol = models.CharField(unique=True, max_length=16)
    to_base_factor = models.DecimalField(max_digits=20, decimal_places=8)
    to_base_offset = models.DecimalField(max_digits=20, decimal_places=8)

    class Meta:
        managed = False
        db_table = 'unit'


class UnitDimension(models.Model):
    name = models.CharField(unique=True, max_length=64)

    class Meta:
        managed = False
        db_table = 'unit_dimension'